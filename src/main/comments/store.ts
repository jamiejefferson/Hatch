// Reads and writes comment files. Hatch reads the file for every operation, so an edit made by hand or by an agent always counts.
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { nextNumber, pageSlug, parseFile, renderFile, type Anchor, type CommentStatus, type CommentThread, type PageComments } from '@shared/comments';
import { projectOf } from '@shared/project-address';
import { newId } from '@shared/workspace';
import { HatchError } from '../cdp/session';
import { sitesFolder } from '../store/folders';
import { push } from '../renderer-rpc';
import { getProxyPort, projectsState } from '../servers/manager';

export interface Place { file: string; dir: string; path: string; site: string }

/** A project page keeps its comments inside the project folder. Any other page keeps them under <comments folder>/<domain>/, and the comments folder is ~/.hatch/sites unless the user chose another. */
export async function placeFor(url: string): Promise<Place> {
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) throw new HatchError('Comments attach to web pages. This Hatch shows no web page yet.');
  const u = new URL(url);
  const project = projectOf(url, (await projectsState(false)).projects, getProxyPort());
  const dir = project ? join(project.kind === 'file' ? dirname(project.folder) : project.folder, '.hatch', 'comments') : join(sitesFolder(), u.host.replace(/[^A-Za-z0-9.-]+/g, '_'));
  return { dir, file: join(dir, `${pageSlug(u.pathname)}.md`), path: u.pathname, site: project ? `hatch:${project.name}` : u.host };
}

const mtimes = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();
const mtimeOf = (file: string): Promise<number> => stat(file).then((s) => s.mtimeMs, () => 0);

async function readAt(file: string, path: string): Promise<PageComments> {
  mtimes.set(file, await mtimeOf(file));
  const text = await readFile(file, 'utf8').catch(() => '');
  const parsed = parseFile(text);
  if (!parsed.ok) return { file, path, threads: [], error: `Hatch cannot read ${file}. ${parsed.error} Hatch leaves the file alone until it reads cleanly.` };
  return { file, path: parsed.path ?? path, threads: parsed.threads, error: null };
}

export const read = async (url: string): Promise<PageComments> => {
  const place = await placeFor(url);
  return readAt(place.file, place.path);
};

/** Every page of the site that the link belongs to. */
export async function readSite(url: string): Promise<{ place: Place; pages: PageComments[] }> {
  const place = await placeFor(url);
  const names = (await readdir(place.dir).catch(() => [] as string[])).filter((n) => n.endsWith('.md')).sort();
  return { place, pages: await Promise.all(names.map((n) => readAt(join(place.dir, n), `/${n.replace(/\.md$/, '').replace(/__/g, '/')}`))) };
}

/** Changes one page's threads and writes the file. Writes to one file run one after another. */
function change(file: string, path: string, work: (threads: CommentThread[]) => CommentThread[]): Promise<PageComments> {
  const run = async (): Promise<PageComments> => {
    const now = await readAt(file, path);
    if (now.error) throw new HatchError(now.error);
    const threads = work(now.threads);
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, renderFile(now.path, threads), 'utf8');
    await rename(temp, file);
    mtimes.set(file, await mtimeOf(file));
    push('comments:changed', file);
    return { ...now, threads };
  };
  const next = (queues.get(file) ?? Promise.resolve()).then(run, run);
  queues.set(file, next.catch(() => {}));
  return next;
}

const clean = (text: string): string => {
  const t = String(text ?? '').trim();
  if (!t) throw new HatchError('A comment needs some words.');
  return t.slice(0, 8000);
};

const edit = (threads: CommentThread[], id: string, work: (t: CommentThread) => CommentThread): CommentThread[] => {
  if (!threads.some((t) => t.id === id)) throw new HatchError(`No comment has the id ${id}. list_comments shows the current ones.`);
  return threads.map((t) => (t.id === id ? work(t) : t));
};

export async function add(url: string, input: { anchor: Anchor; label: string; text: string; author: string }): Promise<{ page: PageComments; thread: CommentThread }> {
  const place = await placeFor(url);
  const text = clean(input.text);
  const id = newId('c');
  const page = await change(place.file, place.path, (threads) => [
    ...threads,
    { id, number: nextNumber(threads), label: input.label || `<${input.anchor.tag}>`, status: 'open', unread: input.author !== 'user', anchor: input.anchor, messages: [{ author: input.author, at: new Date().toISOString(), text, edited: false }] },
  ]);
  return { page, thread: page.threads.find((t) => t.id === id)! };
}

/** Finds a thread on any page of the site, because an agent holds an id and no page. */
export async function findThread(url: string, id: string): Promise<{ page: PageComments; thread: CommentThread }> {
  const { pages } = await readSite(url);
  for (const page of pages) {
    const thread = page.threads.find((t) => t.id === id.trim());
    if (thread) return { page, thread };
  }
  throw new HatchError(`No comment has the id ${id} on this site. list_comments shows the current ones.`);
}

export const reply = (page: PageComments, id: string, text: string, author: string): Promise<PageComments> =>
  change(page.file, page.path, (threads) =>
    edit(threads, id, (t) => ({ ...t, unread: author !== 'user' ? true : t.unread, messages: [...t.messages, { author, at: new Date().toISOString(), text: clean(text), edited: false }] })),
  );

export const setStatus = (page: PageComments, id: string, status: CommentStatus): Promise<PageComments> => change(page.file, page.path, (threads) => edit(threads, id, (t) => ({ ...t, status })));

export const markSeen = (page: PageComments, id: string): Promise<PageComments> => change(page.file, page.path, (threads) => edit(threads, id, (t) => ({ ...t, unread: false })));

export const editMessage = (page: PageComments, id: string, index: number, text: string): Promise<PageComments> =>
  change(page.file, page.path, (threads) =>
    edit(threads, id, (t) => {
      if (t.messages[index]?.author !== 'user') throw new HatchError('Only a message the user wrote can change.');
      return { ...t, messages: t.messages.map((m, i) => (i === index ? { ...m, text: clean(text), edited: true } : m)) };
    }),
  );

export const removeThread = (page: PageComments, id: string): Promise<PageComments> => change(page.file, page.path, (threads) => threads.filter((t) => t.id !== id));

// A comment file changes under Hatch when a person or an agent edits it. Hatch checks the files it has served and tells the interface.
let poll: NodeJS.Timeout | null = null;
export function watchCommentFiles(): void {
  poll ??= setInterval(() => {
    for (const [file, known] of mtimes) {
      void mtimeOf(file).then((now) => {
        if (now === known || mtimes.get(file) !== known) return;
        mtimes.set(file, now);
        push('comments:changed', file);
      });
    }
  }, 1500);
}
export const stopWatchingCommentFiles = (): void => {
  if (poll) clearInterval(poll);
  poll = null;
};
