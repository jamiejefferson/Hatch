// Action buttons open a web app the user reaches for often. The saved list is repaired on every read and write.
import { ACTION_ICONS, type ActionButton, type ActionIcon } from './types';

export const MAX_ACTION_BUTTONS = 24;
export const MAX_ACTION_NAME = 40;

/** Keeps the buttons that carry an id, a name and an address, with a known icon, and drops a second button with the same id. */
export function repairActionButtons(raw: unknown): ActionButton[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ActionButton[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const id = typeof source.id === 'string' ? source.id : '';
    const name = typeof source.name === 'string' ? source.name.trim().slice(0, MAX_ACTION_NAME) : '';
    const url = typeof source.url === 'string' ? source.url.trim() : '';
    if (!id || !name || !url || seen.has(id)) continue;
    seen.add(id);
    const icon = ACTION_ICONS.includes(source.icon as ActionIcon) ? (source.icon as ActionIcon) : 'web';
    out.push({ id, name, url, icon });
    if (out.length === MAX_ACTION_BUTTONS) break;
  }
  return out;
}
