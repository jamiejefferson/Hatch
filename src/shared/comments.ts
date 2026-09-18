// Comments live in one markdown file per page, so a person or an agent working in the project folder reads and edits them as text.

/** Several ways to find one element again after the page changes. Hatch tries them in the order listed here. */
export interface Anchor {
  tag: string;
  id?: string;
  testId?: string;
  cssPath: string;
  role?: string;
  name?: string;
  text?: string;
  href?: string;
}

export interface CommentMessage {
  /** 'user' for the person at the keyboard, otherwise the agent's name. */
  author: string;
  /** ISO time. */
  at: string;
  text: string;
  edited: boolean;
}

export type CommentStatus = 'open' | 'resolved';

export interface CommentThread {
  id: string;
  number: number;
  /** A few words naming the element. */
  label: string;
  status: CommentStatus;
  /** An agent wrote here since the user last opened the thread. */
  unread: boolean;
  anchor: Anchor;
  messages: CommentMessage[];
}

export interface PageComments {
  file: string;
  /** The page's path on its site, such as /pricing. */
  path: string;
  threads: CommentThread[];
  /** Set when Hatch cannot read the file. Hatch then leaves the file alone. */
  error: string | null;
}

export const USER = 'user';
export const authorLabel = (author: string): string => (author === USER ? 'You' : `Agent ${author}`);

/** /docs/getting-started/ becomes docs__getting-started, and the home page becomes index. */
export function pageSlug(pathname: string): string {
  const clean = pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '__').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120);
  return clean.replace(/^\.+/, '') || 'index';
}

const HEADER = 'Hatch keeps the comments for this page here. Edit the words freely. Keep every heading line and every line that starts with a hyphen as it is.';

// A message line that looks like a heading would split the thread when Hatch reads the file back.
const escapeLine = (line: string): string => (/^\\*#{1,3} /.test(line) ? `\\${line}` : line);
const unescapeLine = (line: string): string => (/^\\+#{1,3} /.test(line) ? line.slice(1) : line);

export function renderFile(path: string, threads: CommentThread[]): string {
  const out = [`# Comments on ${path}`, '', HEADER, ''];
  for (const t of threads) {
    out.push(`## ${t.number} · ${t.label.replace(/\s+/g, ' ').trim()}`, `- id: ${t.id}`, `- status: ${t.status}`, `- unread: ${t.unread ? 'yes' : 'no'}`, `- anchor: ${JSON.stringify(t.anchor)}`, '');
    for (const m of t.messages) {
      out.push(`### ${authorLabel(m.author)} · ${m.at}${m.edited ? ' · edited' : ''}`, ...m.text.trim().split('\n').map(escapeLine), '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
}

export type Parsed = { ok: true; path: string | null; threads: CommentThread[] } | { ok: false; error: string };

export function parseFile(text: string): Parsed {
  const lines = text.split(/\r?\n/);
  const threads: CommentThread[] = [];
  let path: string | null = null;
  let thread: (Partial<CommentThread> & { line: number; meta: Record<string, string> }) | null = null;
  let message: (CommentMessage & { body: string[] }) | null = null;
  let error: string | null = null;

  const closeMessage = (): void => {
    if (!message || !thread) return;
    const { body, ...rest } = message;
    thread.messages!.push({ ...rest, text: body.join('\n').trim() });
    message = null;
  };
  const closeThread = (): void => {
    closeMessage();
    if (!thread || error) return;
    const { meta, line } = thread;
    const fail = (what: string): void => void (error = `Line ${line}: the comment "${thread!.label}" ${what}.`);
    if (!meta.id) return fail('has no id line');
    if (threads.some((t) => t.id === meta.id)) return fail('repeats the id of an earlier comment');
    if (meta.status !== 'open' && meta.status !== 'resolved') return fail('needs a status line that says open or resolved');
    let anchor: Anchor;
    try {
      anchor = JSON.parse(meta.anchor ?? '') as Anchor;
      if (typeof anchor?.cssPath !== 'string' || typeof anchor.tag !== 'string') throw new Error('shape');
    } catch {
      return fail('has an anchor line Hatch cannot read');
    }
    threads.push({ id: meta.id, number: thread.number!, label: thread.label!, status: meta.status, unread: meta.unread === 'yes', anchor, messages: thread.messages! });
  };

  lines.forEach((raw, index) => {
    if (error) return;
    const n = index + 1;
    if (raw.startsWith('# ') && !thread) {
      path = raw.match(/^# Comments on (\/\S*)/)?.[1] ?? path;
    } else if (raw.startsWith('## ')) {
      closeThread();
      const heading = raw.match(/^## (\d+) · (.*)$/);
      if (!heading) return void (error = `Line ${n}: a comment heading reads "## 1 · Element name".`);
      thread = { number: Number(heading[1]), label: heading[2]!.trim(), messages: [], meta: {}, line: n };
    } else if (raw.startsWith('### ') && thread) {
      closeMessage();
      const heading = raw.match(/^### (You|Agent (.+?)) · (\S+)( · edited)?\s*$/);
      if (!heading || Number.isNaN(Date.parse(heading[3]!))) return void (error = `Line ${n}: a message heading reads "### You · 2026-01-31T09:00:00.000Z".`);
      message = { author: heading[2] ?? USER, at: heading[3]!, edited: !!heading[4], text: '', body: [] };
    } else if (message) {
      message.body.push(unescapeLine(raw));
    } else if (thread) {
      const meta = raw.match(/^- (id|status|unread|anchor): (.*)$/);
      if (meta) thread.meta[meta[1]!] = meta[2]!.trim();
    }
  });
  closeThread();
  return error ? { ok: false, error } : { ok: true, path, threads };
}

/** Pure changes to a page's threads. The store applies one and writes the file. */
export const nextNumber = (threads: CommentThread[]): number => threads.reduce((max, t) => Math.max(max, t.number), 0) + 1;
