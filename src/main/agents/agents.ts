// Who is calling, which tab they hold, and which Hatch their calls act on.
// The MCP SDK gives no session id in either protocol version, so Hatch issues identity itself:
// the stdio shim sends an X-Hatch-Agent header, and an agent that connects over HTTP uses a URL ending ?agent=<name>.
import { homedir } from 'node:os';
import type { AgentWorkState, InterfaceState } from '@shared/types';
import { canvasForFolderIn, cleanPath, holds as folderHolds, projectRoot } from '@shared/project-canvas';
import { basename } from 'node:path';
import { idFromLink } from '@shared/hatch-link';
import { HatchError } from '../cdp/session';
import { callInterface, push } from '../renderer-rpc';
import { projectsState } from '../servers/manager';

/** An agent that stays silent this long gives up its tab to the next agent that needs one. */
const CLAIM_IDLE_MS = 5 * 60_000;
/** The working indicator clears this long after an agent's last call. */
const WORKING_IDLE_MS = 20_000;

export interface Agent {
  id: string;
  tabId: string | null;
  hatchId: string | null;
  lastCall: number;
  running: number;
  finished: boolean;
  intent: string;
  /** The Hatch the intent was given for. Null while the call that gave it is still running, because that call may move the agent to a new Hatch. */
  intentHatch: string | null;
  /** The step a long tool has reached, such as a jev_run step. It clears when the call ends. */
  doing: string;
  /** The folder the agent works in, which the stdio shim sends. It puts the agent on its project's canvas. */
  folder: string | null;
}

const agents = new Map<string, Agent>();
const queues = new Map<string, Promise<unknown>>();

/** The start of the identity Hatch gives an agent that sent no name. */
export const UNNAMED = 'unnamed-';

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);

/** The folder an agent works in: the shim's X-Hatch-Folder header, or ?folder= for an agent that connects by address. The home folder counts as none. */
export function folderOf(request: Request | undefined): string | null {
  const header = request?.headers.get('x-hatch-folder');
  const query = request && URL.canParse(request.url) ? new URL(request.url).searchParams.get('folder') : null;
  let folder = '';
  try {
    folder = decodeURIComponent(header || query || '').replace(/\/+$/, '');
  } catch {
    return null;
  }
  return folder.startsWith('/') && folder !== homedir() ? folder : null;
}

export function identify(request: Request | undefined): string {
  const header = request?.headers.get('x-hatch-agent');
  const query = request && URL.canParse(request.url) ? new URL(request.url).searchParams.get('agent') : null;
  const folder = folderOf(request);
  const base = slug(header || query || '');
  // Every Claude Code session sends the same name, so the folder tells sessions in different projects apart.
  const named = base && folder ? `${base}.${slug(basename(folder))}`.slice(0, 64) : base;
  if (named) return named;
  // An agent that gives no name still must not share a tab with another app that also gave none, so its app's name stands in.
  const product = slug((request?.headers.get('user-agent') ?? '').split(/[\s/]/)[0] ?? '');
  return `${UNNAMED}${product || 'agent'}`;
}

export function agentFor(id: string): Agent {
  let agent = agents.get(id);
  if (!agent) {
    agent = { id, tabId: null, hatchId: null, lastCall: 0, running: 0, finished: false, intent: '', intentHatch: null, doing: '', folder: null };
    agents.set(id, agent);
  }
  return agent;
}

const holds = (agent: Agent, now: number): boolean => agent.tabId !== null && !agent.finished && (agent.running > 0 || now - agent.lastCall < CLAIM_IDLE_MS);

/**
 * The tab a call acts on. A call that names a canvas goes there, whoever else is at work in it: calls on one tab
 * run one at a time (see inTabQueue), and a canvas belongs to no agent (JJ, 22 Sep 2026). A call that names none
 * uses the agent's own tab; an agent with none claims the front tab when no other agent is at work there, and
 * otherwise opens a new tab, so an unaddressed first call never lands in another agent's pages.
 */
export async function tabFor(agent: Agent, canvas?: string): Promise<{ tabId: string; state: InterfaceState }> {
  let state = await callInterface<InterfaceState>('state');
  const now = Date.now();
  const heldByOther = (tabId: string): boolean => [...agents.values()].some((a) => a !== agent && a.tabId === tabId && holds(a, now));

  if (canvas) {
    const id = idFromLink(canvas);
    if (!state.tabs.some((t) => t.id === id)) throw new HatchError(`No canvas has the id ${id}. Call list_canvases to see them.`);
    if (agent.tabId !== id) agent.hatchId = null;
    agent.tabId = id;
    agent.finished = false;
    return { tabId: id, state };
  }
  const mine = agent.tabId && state.tabs.some((t) => t.id === agent.tabId) ? agent.tabId : null;
  if (!mine && agent.folder) {
    // An agent that works in a folder works on that folder's canvas, or on a new one made for the folder.
    agent.tabId = (await canvasForFolder(agent.folder, state)).tabId;
    state = await callInterface<InterfaceState>('state');
    agent.hatchId = null;
  } else if (!mine) {
    if (!heldByOther(state.activeTabId)) agent.tabId = state.activeTabId;
    else {
      agent.tabId = await callInterface<string>('newTab');
      state = await callInterface<InterfaceState>('state');
    }
    agent.hatchId = null;
  }
  agent.finished = false;
  return { tabId: agent.tabId!, state };
}

/**
 * The canvas for an agent's folder: the canvas attached to the folder or to a folder above it, or a new canvas attached to
 * the folder. A folder inside a registered project attaches the project's whole folder. The user's other canvases stay untouched.
 */
export async function canvasForFolder(folder: string, state?: InterfaceState): Promise<{ tabId: string; folder: string; opened: boolean }> {
  const current = state ?? (await callInterface<InterfaceState>('state'));
  const held = canvasForFolderIn(folder, current.tabs, homedir());
  if (held) return { tabId: held.id, folder: held.folder!, opened: false };
  const { projects } = await projectsState(false);
  const root = projects.map((p) => cleanPath(projectRoot(p))).filter((r) => r !== homedir() && folderHolds(r, folder)).sort((a, b) => b.length - a.length)[0];
  const target = root ?? cleanPath(folder);
  return { tabId: await callInterface<string>('newTab', { folder: target }), folder: target, opened: true };
}

/**
 * The Hatch a call acts on: the one named, else the agent's current Hatch, else the selected or first Hatch of
 * the canvas the call names or the agent holds.
 */
export async function hatchFor(agent: Agent, link?: string, canvas?: string): Promise<{ tabId: string; hatchId: string | null; state: InterfaceState }> {
  const named = link ? idFromLink(link) : undefined;
  if (named) await followLink(agent, named);
  const { tabId, state } = await tabFor(agent, named ? undefined : canvas);
  const tab = state.tabs.find((t) => t.id === tabId)!;
  if (named && named !== tabId) {
    if (!tab.hatches.some((h) => h.id === named)) throw new HatchError(`No Hatch in your tab has the id ${named}. Call list_hatches to see yours.`);
    return { tabId, hatchId: named, state };
  }
  const current = agent.hatchId && tab.hatches.some((h) => h.id === agent.hatchId) ? agent.hatchId : null;
  const hatchId = current ?? tab.selectedHatchId ?? tab.hatches[0]?.id ?? null;
  agent.hatchId = hatchId;
  return { tabId, hatchId, state };
}

/**
 * A named Hatch or canvas may sit in a tab the agent does not hold: a link the user copied, or an id from
 * list_canvases. The agent moves to that tab. Another agent at work there does not stop it, because calls on one
 * tab run one at a time and the user asked for canvases that any agent may open, close and use.
 */
async function followLink(agent: Agent, id: string): Promise<void> {
  const state = await callInterface<InterfaceState>('state');
  const home = state.tabs.find((t) => t.id === id || t.hatches.some((h) => h.id === id));
  if (!home || home.id === agent.tabId) return;
  agent.tabId = home.id;
  agent.hatchId = null;
  agent.finished = false;
}

/** Calls that touch one tab run one after another, because two agents, or one agent with parallel calls, may reach it at once. */
export function inTabQueue<T>(tabId: string, work: () => Promise<T>): Promise<T> {
  const next = (queues.get(tabId) ?? Promise.resolve()).then(work, work);
  queues.set(tabId, next.catch(() => {}));
  return next;
}

// ---- working indicator ----

let timer: NodeJS.Timeout | null = null;
let lastSent = '';

export function workState(): AgentWorkState {
  const now = Date.now();
  const state: AgentWorkState = { tabs: {}, hatches: {} };
  for (const a of agents.values()) {
    const working = !a.finished && (a.running > 0 || now - a.lastCall < WORKING_IDLE_MS);
    if (!working || !a.tabId) continue;
    state.tabs[a.tabId] = { agent: a.id, intent: a.intent };
    // An intent belongs to the Hatch it was given for, so an agent that moves on without a new one shows none rather than an old task.
    const intent = a.intentHatch === null || a.intentHatch === a.hatchId ? a.intent : '';
    if (a.hatchId) state.hatches[a.hatchId] = { agent: a.id, intent, doing: a.doing };
  }
  return state;
}

export function publishWork(): void {
  const state = workState();
  const text = JSON.stringify(state);
  if (text !== lastSent) {
    lastSent = text;
    push('agents:work', state);
  }
  const busy = Object.keys(state.tabs).length > 0;
  if (busy && !timer) timer = setInterval(publishWork, 2000);
  if (!busy && timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function callStarted(agent: Agent, intent: string | undefined): void {
  agent.running += 1;
  agent.lastCall = Date.now();
  if (intent) {
    agent.intent = intent;
    agent.intentHatch = null;
  } else if (agent.intentHatch !== null && agent.intentHatch !== agent.hatchId) agent.intent = '';
  publishWork();
}

/** `gaveIntent` says the call carried an intent, which then belongs to the Hatch the call ended on. */
export function callEnded(agent: Agent, gaveIntent = false): void {
  agent.running = Math.max(0, agent.running - 1);
  agent.lastCall = Date.now();
  if (gaveIntent && agent.intentHatch === null) agent.intentHatch = agent.hatchId;
  if (agent.running === 0) agent.doing = '';
  publishWork();
}

/** A long tool says which step it has reached, and the Hatch shows it while the call runs. */
export function nowDoing(agent: Agent, doing: string): void {
  agent.doing = doing.slice(0, 140);
  publishWork();
}

export function finish(agent: Agent): void {
  agent.finished = true;
  agent.intent = '';
  publishWork();
}
