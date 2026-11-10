// The pages the user's Hatches showed lately, newest first. New Hatch offers them. Pure functions, so the main process and the renderer share them.
import type { RecentPage } from './types';

/** The workspace keeps this many pages. */
export const RECENT_LIMIT = 50;
/** New Hatch shows this many. */
export const RECENT_SHOWN = 8;

/** Two addresses that differ only after # name one page. */
const pageOf = (url: string): string => url.split('#')[0]!;
/** Web pages and local files are worth returning to. Hatch's own blank and error pages are not. */
const worthKeeping = (url: string): boolean => /^(https?|file):/i.test(url);

/** Puts the page at the front, taking out an earlier visit to it, and keeps the title an earlier visit learned until the page sends its own. */
export function notePage(list: RecentPage[], url: string, title = ''): RecentPage[] {
  if (!worthKeeping(url)) return list;
  const earlier = list.find((p) => pageOf(p.url) === pageOf(url));
  const rest = list.filter((p) => p !== earlier);
  return [{ url, title: title || earlier?.title || '' }, ...rest].slice(0, RECENT_LIMIT);
}

/** Gives the page its title once it arrives, and leaves the order alone. */
export function titlePage(list: RecentPage[], url: string, title: string): RecentPage[] {
  if (!title) return list;
  const i = list.findIndex((p) => pageOf(p.url) === pageOf(url));
  if (i < 0 || list[i]!.title === title) return list;
  return list.map((p, j) => (j === i ? { ...p, title } : p));
}

/** The pages whose title or address holds the typed text, newest first. Empty text matches every page. */
export function matchRecent(list: RecentPage[], text: string, limit = RECENT_SHOWN): RecentPage[] {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => words.every((w) => `${p.title} ${p.url}`.toLowerCase().includes(w))).slice(0, limit);
}

/** Accepts whatever sits in workspace.json. */
export function repairRecent(raw: unknown): RecentPage[] {
  if (!Array.isArray(raw)) return [];
  let out: RecentPage[] = [];
  for (const item of [...raw].reverse()) {
    if (!item || typeof item !== 'object') continue;
    const { url, title } = item as Record<string, unknown>;
    if (typeof url === 'string') out = notePage(out, url, typeof title === 'string' ? title.slice(0, 300) : '');
  }
  return out;
}
