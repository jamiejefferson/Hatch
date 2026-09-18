// Local projects: the registry, the dev servers Hatch starts, and the ones it finds already running.
import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NAME_RULE, nameFromFolder, projectUrl, PROXY_PORT } from '@shared/project-address';
import type { FoundServer, Project, ProjectsState, ProjectState, ProjectStatus } from '@shared/types';
import { HatchError } from '../cdp/session';
import { dataFile } from '../paths';
import { push } from '../renderer-rpc';
import { JsonStore } from '../store/json-store';
import { commandWithPort, detect } from './frameworks';
import { listeners, portsOfGroup } from './lsof';

const FIRST_PORT = 4300;
const LOG_LINES = 500;
const PROJECT_MARKERS = ['package.json', 'index.html', 'Gemfile', 'manage.py', 'hugo.toml', 'config.toml', 'composer.json'];

function repair(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Project => !!p && typeof p.name === 'string' && NAME_RULE.test(p.name) && typeof p.folder === 'string')
    .map((p) => ({
      name: p.name,
      folder: p.folder,
      kind: p.kind === 'folder' || p.kind === 'file' ? p.kind : 'server',
      command: typeof p.command === 'string' ? p.command : '',
      port: Number.isInteger(p.port) ? p.port : 0,
      direct: p.direct === true,
      framework: typeof p.framework === 'string' ? p.framework : '',
    }));
}

const store = new JsonStore<Project[]>(dataFile('projects.json'), repair);

interface Running { child: ChildProcess; status: ProjectStatus; livePort: number | null }
const running = new Map<string, Running>();
const failed = new Set<string>();
const logs = new Map<string, string[]>();
let proxyPort: number | null = null;
let lastFound: { live: Map<string, number>; found: FoundServer[] } = { live: new Map(), found: [] };

export const setProxyPort = (port: number | null): void => void (proxyPort = port);
export const getProxyPort = (): number => proxyPort ?? PROXY_PORT;
export const listProjects = (): Promise<Project[]> => store.read();

const portOpen = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ port, host, timeout: 400 });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true)).once('error', () => done(false)).once('timeout', () => done(false));
  });

/** A dev server binds the IPv4 loopback, the IPv6 one, or both, depending on the framework and the Node version. */
export async function hostFor(port: number): Promise<string | null> {
  if (await portOpen(port, '127.0.0.1')) return '127.0.0.1';
  if (await portOpen(port, '::1')) return '::1';
  return null;
}

const inside = (folder: string, cwd: string): boolean => cwd === folder || cwd.startsWith(`${folder}/`);

/** Looks at what listens on the machine and matches each server to a project by the longest folder match. */
async function discover(projects: Project[]): Promise<typeof lastFound> {
  const live = new Map<string, number>();
  const found: FoundServer[] = [];
  const home = homedir();
  const servers = projects.filter((p) => p.kind === 'server').sort((a, b) => b.folder.length - a.folder.length);
  for (const l of await listeners()) {
    if (l.pid === process.pid || l.port === proxyPort) continue;
    const owner = servers.find((p) => inside(p.folder, l.cwd));
    if (owner) {
      // A project's own stable port wins over any other port its processes hold, such as a hot-reload socket.
      if (!live.has(owner.name) || l.port === owner.port) live.set(owner.name, l.port);
      continue;
    }
    if (!inside(home, l.cwd) || l.cwd === home || found.some((f) => f.folder === l.cwd)) continue;
    const marked = (await Promise.all(PROJECT_MARKERS.map((m) => stat(join(l.cwd, m)).then(() => true, () => false)))).some(Boolean);
    if (marked) found.push({ folder: l.cwd, port: l.port, command: l.command });
  }
  lastFound = { live, found };
  return lastFound;
}

function stateOf(p: Project, live: Map<string, number>): ProjectState {
  const mine = running.get(p.name);
  const livePort = p.kind === 'server' ? (mine?.livePort ?? live.get(p.name) ?? null) : null;
  let status: ProjectStatus = 'stopped';
  if (p.kind !== 'server') status = 'running';
  else if (mine) status = mine.status;
  else if (livePort) status = 'running';
  else if (failed.has(p.name)) status = 'failed';
  return { ...p, status, livePort, startedByHatch: !!mine, url: projectUrl(p, getProxyPort()) };
}

export async function projectsState(refresh = true): Promise<ProjectsState> {
  const projects = await store.read();
  const { live, found } = refresh ? await discover(projects) : lastFound;
  return { projects: projects.map((p) => stateOf(p, live)), found, proxyPort };
}

export async function publish(refresh = false): Promise<void> {
  push('projects:state', await projectsState(refresh));
}

export async function projectState(name: string): Promise<ProjectState | null> {
  const p = (await store.read()).find((x) => x.name === name.toLowerCase());
  return p ? stateOf(p, lastFound.live) : null;
}

async function freePort(projects: Project[]): Promise<number> {
  const taken = new Set(projects.map((p) => p.port));
  for (let port = FIRST_PORT; port < FIRST_PORT + 500; port += 1) {
    if (!taken.has(port) && !(await hostFor(port))) return port;
  }
  throw new HatchError('Hatch found no free port between 4300 and 4800.');
}

export async function register(input: { folder: string; name?: string; command?: string }): Promise<ProjectState> {
  const folder = input.folder.replace(/\/+$/, '').replace(/^~(?=\/|$)/, homedir());
  if (!(await stat(folder).catch(() => null))) throw new HatchError(`Nothing exists at ${folder}.`);
  const projects = await store.read();
  const known = projects.find((p) => p.folder === folder);
  if (known) return stateOf(known, lastFound.live);

  const detected = await detect(folder);
  let name = (input.name ?? nameFromFolder(folder)).toLowerCase();
  if (!NAME_RULE.test(name)) throw new HatchError('A project name uses lower-case letters, digits and hyphens, and starts with a letter or a digit.');
  if (input.name && projects.some((p) => p.name === name)) throw new HatchError(`A project is already named ${name}.`);
  for (let n = 2; projects.some((p) => p.name === name); n += 1) name = `${nameFromFolder(folder)}-${n}`;

  const project: Project = { name, folder, kind: detected.kind, command: input.command?.trim() || detected.command, port: await freePort(projects), direct: false, framework: detected.framework };
  if (input.command?.trim() && project.kind === 'folder') project.kind = 'server';
  await store.write([...projects, project]);
  await publish(true);
  return stateOf(project, lastFound.live);
}

export async function update(name: string, change: Partial<Pick<Project, 'name' | 'command' | 'port' | 'direct'>>): Promise<ProjectState> {
  const projects = await store.read();
  const current = projects.find((p) => p.name === name);
  if (!current) throw new HatchError(`No project is named ${name}.`);
  const next = { ...current };
  if (change.name !== undefined && change.name !== current.name) {
    const wanted = change.name.toLowerCase().replace(/^hatch:/, '');
    if (!NAME_RULE.test(wanted)) throw new HatchError('A project name uses lower-case letters, digits and hyphens.');
    if (projects.some((p) => p.name === wanted)) throw new HatchError(`A project is already named ${wanted}.`);
    if (running.has(name)) throw new HatchError('Stop the project before you rename it.');
    next.name = wanted;
  }
  if (change.command !== undefined) {
    next.command = change.command.trim();
    if (next.command && next.kind === 'folder') next.kind = 'server';
  }
  if (change.port !== undefined && change.port !== current.port) {
    if (!Number.isInteger(change.port) || change.port < 1024 || change.port > 65535) throw new HatchError('A port is a whole number between 1024 and 65535.');
    if (projects.some((p) => p !== current && p.port === change.port)) throw new HatchError(`Another project already uses port ${change.port}.`);
    next.port = change.port;
  }
  if (change.direct !== undefined) next.direct = change.direct;
  await store.write(projects.map((p) => (p === current ? next : p)));
  await publish();
  return stateOf(next, lastFound.live);
}

export async function remove(name: string): Promise<void> {
  await stop(name).catch(() => {});
  await store.update((projects) => projects.filter((p) => p.name !== name));
  logs.delete(name);
  await publish();
}

// ---- launching ----

// Dev servers colour their output. The escape character is built here so this file holds no raw control characters.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*${BEL}`, 'g');
const quote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

function appendLog(name: string, chunk: string): void {
  const log = logs.get(name) ?? [];
  for (const line of chunk.replace(ANSI, '').split(/\r?\n/)) if (line.trim()) log.push(line.trimEnd());
  logs.set(name, log.slice(-LOG_LINES));
  push('projects:log', { name, lines: logs.get(name) });
}

/** Polls a server Hatch started until its port answers or its process exits. */
async function watchPort(project: Project, entry: Running): Promise<void> {
  while (running.get(project.name) === entry && entry.status === 'starting') {
    if (await hostFor(project.port)) entry.livePort = project.port;
    // A server that ignored the port flag still counts, on whatever port it took.
    else if (entry.child.pid) entry.livePort = (await portsOfGroup(entry.child.pid))[0] ?? null;
    if (entry.livePort) {
      entry.status = 'running';
      if (entry.livePort !== project.port) appendLog(project.name, `The server chose port ${entry.livePort} and ignored ${project.port}. Hatch follows it.`);
      return void publish();
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

export const logOf = (name: string): string[] => logs.get(name) ?? [];

/** Starts a project's dev server and resolves when its port answers or when the wait runs out. The server keeps starting either way. */
export async function start(name: string, waitMs: number, tick?: (elapsedMs: number) => void): Promise<{ state: ProjectState; ready: boolean }> {
  const project = (await store.read()).find((p) => p.name === name.toLowerCase());
  if (!project) throw new HatchError(`No project is named ${name}. list_projects shows the registered ones, and register_project adds a folder.`);
  if (project.kind !== 'server') return { state: stateOf(project, lastFound.live), ready: true };
  if (!project.command) throw new HatchError(`The project ${project.name} has no dev command. Set one in its settings in Hatch.`);

  await discover(await store.read());
  let mine = running.get(project.name);
  if (!mine && lastFound.live.has(project.name)) return { state: stateOf(project, lastFound.live), ready: true };

  if (!mine) {
    const command = commandWithPort(project.command, project.framework, project.port);
    logs.set(project.name, []);
    appendLog(project.name, `$ ${command}`);
    // A login shell brings the PATH the user's terminal has. An app launched from the Dock loses nvm, Corepack and bun otherwise.
    const shell = process.env.SHELL || '/bin/zsh';
    const child = spawn(shell, ['-ilc', `cd ${quote(project.folder)} && exec ${command}`], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(project.port), BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const entry: Running = { child, status: 'starting', livePort: null };
    mine = entry;
    running.set(project.name, entry);
    failed.delete(project.name);
    child.stdout?.on('data', (d: Buffer) => appendLog(project.name, d.toString()));
    child.stderr?.on('data', (d: Buffer) => appendLog(project.name, d.toString()));
    child.once('error', (error) => appendLog(project.name, `Hatch could not run the command: ${error.message}`));
    child.once('exit', (code, signal) => {
      if (running.get(project.name) !== entry) return;
      running.delete(project.name);
      appendLog(project.name, signal ? `The server stopped (${signal}).` : `The server exited with code ${code}.`);
      if (entry.status === 'starting') failed.add(project.name);
      void publish(true);
    });
    void publish();
    void watchPort(project, entry);
  }

  // The port watch runs whether or not a caller waits, so a start from the Projects panel reaches "running" too.
  const began = Date.now();
  while (running.get(project.name) === mine && mine.status === 'starting') {
    const elapsed = Date.now() - began;
    if (elapsed >= waitMs) break;
    tick?.(elapsed);
    await new Promise((r) => setTimeout(r, 200));
  }
  const state = (await projectState(project.name))!;
  return { state, ready: state.status === 'running' };
}

export async function stop(name: string): Promise<void> {
  const mine = running.get(name);
  if (!mine) {
    const state = await projectState(name);
    if (state?.status === 'running' && state.kind === 'server') throw new HatchError(`Hatch did not start ${name}, so it leaves it running. Stop it where it was started.`);
    return;
  }
  const { child } = mine;
  running.delete(name);
  await new Promise<void>((resolve) => {
    const force = setTimeout(() => signal(child, 'SIGKILL'), 3000);
    child.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    // The dev command runs under a shell and spawns children, so the signal goes to the whole process group.
    signal(child, 'SIGTERM');
  });
  appendLog(name, 'Hatch stopped the server.');
  await publish(true);
}

function signal(child: ChildProcess, sig: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, sig);
  } catch {
    child.kill(sig);
  }
}

/** Hatch stops the servers it started when it quits. */
export function stopAllNow(): void {
  for (const { child } of running.values()) signal(child, 'SIGTERM');
  running.clear();
}
