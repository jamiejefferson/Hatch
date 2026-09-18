// Finds dev servers already running on the machine, whoever started them.
import { execFile } from 'node:child_process';

export interface Listener { pid: number; command: string; port: number; host: string }

const run = (args: string[]): Promise<string> =>
  new Promise((resolve) => {
    // lsof exits 1 when it finds nothing, which is an answer and no failure.
    execFile('/usr/sbin/lsof', args, { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (_error, stdout) => resolve(stdout ?? ''));
  });

/** Parses `lsof -F pcn` output: a p line opens a process, c names it, and each n line is one listening socket. */
export function parseListeners(output: string): Listener[] {
  const found: Listener[] = [];
  let pid = 0;
  let command = '';
  for (const line of output.split('\n')) {
    const tag = line[0];
    const value = line.slice(1);
    if (tag === 'p') pid = Number(value);
    else if (tag === 'c') command = value;
    else if (tag === 'n') {
      const match = value.match(/^(.*):(\d+)$/);
      if (!match || !pid) continue;
      const host = match[1]!.replace(/^\[|\]$/g, '');
      const port = Number(match[2]);
      if (!found.some((l) => l.pid === pid && l.port === port)) found.push({ pid, command, port, host });
    }
  }
  return found;
}

/** Parses `lsof -d cwd -F pn` output into pid → working directory. */
export function parseCwds(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid = 0;
  for (const line of output.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

export async function listeners(): Promise<(Listener & { cwd: string })[]> {
  const all = parseListeners(await run(['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']));
  if (all.length === 0) return [];
  const cwds = parseCwds(await run(['-a', '-d', 'cwd', '-p', [...new Set(all.map((l) => l.pid))].join(','), '-F', 'pn']));
  return all.map((l) => ({ ...l, cwd: cwds.get(l.pid) ?? '' })).filter((l) => l.cwd);
}

/** The ports a process group listens on, which finds a dev server that ignored the port Hatch asked for. */
export async function portsOfGroup(pgid: number): Promise<number[]> {
  return parseListeners(await run(['-nP', '-a', '-g', String(pgid), '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'])).map((l) => l.port);
}
