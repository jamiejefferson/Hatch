// Tidy, row, column, grid, align and distribute for Hatches and notes on a canvas. Pure functions, unit tested.
// A Hatch and the notes attached to it move as one unit, and a page keeps its size whatever the arrangement.
import type { Group, Note, Tab } from './types';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One thing that moves: a Hatch with its attached notes, or a free note. `box` is its whole extent on the canvas. */
export interface Unit {
  id: string;
  box: Box;
}

export type ArrangeMode =
  | 'tidy'
  | 'row'
  | 'column'
  | 'grid'
  | 'align-left'
  | 'align-centre'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical';

export const ARRANGE_MODES: ArrangeMode[] = ['tidy', 'row', 'column', 'grid', 'align-left', 'align-centre', 'align-right', 'align-top', 'align-middle', 'align-bottom', 'distribute-horizontal', 'distribute-vertical'];

/** The space between arranged items, in canvas pixels. */
export const ARRANGE_GAP = 64;

/** How a canvas measures its items. A note keeps one size on screen, so its size on the canvas depends on the zoom. */
export interface Measure {
  /** A note's size on the canvas. */
  note: { width: number; height: number };
  /** The room a Hatch's title row takes above the page, on the canvas. */
  title: number;
}

export const measureAt = (zoom: number, noteOnScreen: { width: number; height: number }, titleOnScreen: number): Measure => ({
  note: { width: noteOnScreen.width / zoom, height: noteOnScreen.height / zoom },
  title: titleOnScreen / zoom,
});

export function bounds(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export const noteBox = (n: Note, m: Measure): Box => ({ x: n.x, y: n.y, width: m.note.width, height: m.note.height });

/** The units for a set of Hatch and note ids. A note attached to a Hatch counts with its Hatch, never on its own. */
export function unitsFor(tab: Tab, ids: string[], m: Measure): Unit[] {
  const wanted = new Set(ids);
  const notes = tab.notes ?? [];
  const units: Unit[] = [];
  for (const h of tab.hatches) {
    if (!wanted.has(h.id)) continue;
    const own = notes.filter((n) => n.attachedTo === h.id).map((n) => noteBox(n, m));
    units.push({ id: h.id, box: bounds([{ x: h.x, y: h.y - m.title, width: h.width, height: h.height + m.title }, ...own]) });
  }
  for (const n of notes) if (wanted.has(n.id) && !n.attachedTo) units.push({ id: n.id, box: noteBox(n, m) });
  return units;
}

/** Puts units into rows by their tops: a unit whose top sits within the first half of a row's first unit joins that row. */
function rowsOf(units: Unit[]): Unit[][] {
  const rows: Unit[][] = [];
  for (const u of [...units].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    const row = rows[rows.length - 1];
    const lead = row?.[0];
    if (row && lead && u.box.y < lead.box.y + lead.box.height / 2) row.push(u);
    else rows.push([u]);
  }
  return rows.map((r) => r.sort((a, b) => a.box.x - b.box.x));
}

/** Where each unit goes, as the distance it moves. Units that stay put are left out. */
export function arrange(units: Unit[], mode: ArrangeMode, gap = ARRANGE_GAP): Map<string, { dx: number; dy: number }> {
  const to = new Map<string, { x: number; y: number }>();
  const all = bounds(units.map((u) => u.box));
  const reading = rowsOf(units).flat();

  switch (mode) {
    case 'tidy': {
      let top = all.y;
      for (const row of rowsOf(units)) {
        let left = all.x;
        for (const u of row) {
          to.set(u.id, { x: left, y: top });
          left += u.box.width + gap;
        }
        top += Math.max(...row.map((u) => u.box.height)) + gap;
      }
      break;
    }
    case 'row': {
      let left = all.x;
      for (const u of [...units].sort((a, b) => a.box.x - b.box.x)) {
        to.set(u.id, { x: left, y: all.y });
        left += u.box.width + gap;
      }
      break;
    }
    case 'column': {
      let top = all.y;
      for (const u of [...units].sort((a, b) => a.box.y - b.box.y)) {
        to.set(u.id, { x: all.x, y: top });
        top += u.box.height + gap;
      }
      break;
    }
    case 'grid': {
      const columns = Math.ceil(Math.sqrt(reading.length));
      const cell = Math.max(...reading.map((u) => u.box.width));
      let top = all.y;
      for (let i = 0; i < reading.length; i += columns) {
        const row = reading.slice(i, i + columns);
        row.forEach((u, c) => to.set(u.id, { x: all.x + c * (cell + gap), y: top }));
        top += Math.max(...row.map((u) => u.box.height)) + gap;
      }
      break;
    }
    case 'align-left':
      for (const u of units) to.set(u.id, { x: all.x, y: u.box.y });
      break;
    case 'align-right':
      for (const u of units) to.set(u.id, { x: all.x + all.width - u.box.width, y: u.box.y });
      break;
    case 'align-centre':
      for (const u of units) to.set(u.id, { x: all.x + all.width / 2 - u.box.width / 2, y: u.box.y });
      break;
    case 'align-top':
      for (const u of units) to.set(u.id, { x: u.box.x, y: all.y });
      break;
    case 'align-bottom':
      for (const u of units) to.set(u.id, { x: u.box.x, y: all.y + all.height - u.box.height });
      break;
    case 'align-middle':
      for (const u of units) to.set(u.id, { x: u.box.x, y: all.y + all.height / 2 - u.box.height / 2 });
      break;
    case 'distribute-horizontal':
    case 'distribute-vertical': {
      // The first and last stay where they are, and the space between them is shared evenly.
      if (units.length < 3) break;
      const across = mode === 'distribute-horizontal';
      const sorted = [...units].sort((a, b) => (across ? a.box.x + a.box.width / 2 - (b.box.x + b.box.width / 2) : a.box.y + a.box.height / 2 - (b.box.y + b.box.height / 2)));
      const size = (u: Unit): number => (across ? u.box.width : u.box.height);
      const start = across ? all.x : all.y;
      const span = across ? all.width : all.height;
      const space = (span - sorted.reduce((sum, u) => sum + size(u), 0)) / (sorted.length - 1);
      let at = start;
      for (const u of sorted) {
        to.set(u.id, across ? { x: at, y: u.box.y } : { x: u.box.x, y: at });
        at += size(u) + space;
      }
      break;
    }
  }

  const moves = new Map<string, { dx: number; dy: number }>();
  for (const u of units) {
    const place = to.get(u.id);
    if (!place) continue;
    const dx = Math.round(place.x - u.box.x);
    const dy = Math.round(place.y - u.box.y);
    if (dx || dy) moves.set(u.id, { dx, dy });
  }
  return moves;
}

/** Moves units on a tab: a Hatch takes its attached notes along. Everything else stays where it was. */
export function applyMoves(tab: Tab, moves: Map<string, { dx: number; dy: number }>): Tab {
  if (moves.size === 0) return tab;
  const notes = tab.notes?.map((n) => {
    const move = moves.get(n.attachedTo ?? n.id);
    return move ? { ...n, x: Math.round(n.x + move.dx), y: Math.round(n.y + move.dy) } : n;
  });
  return {
    ...tab,
    hatches: tab.hatches.map((h) => {
      const move = moves.get(h.id);
      return move ? { ...h, x: Math.round(h.x + move.dx), y: Math.round(h.y + move.dy) } : h;
    }),
    ...(notes ? { notes } : {}),
  };
}

/** The group an item belongs to. A note attached to a Hatch belongs to its Hatch's group. */
export function groupOf(tab: Tab, id: string): Group | null {
  const note = tab.notes?.find((n) => n.id === id);
  const key = note?.attachedTo ?? id;
  return tab.groups?.find((g) => g.members.includes(key)) ?? null;
}

/** Every item a set of ids stands for: a Hatch brings its attached notes. */
export function withAttached(tab: Tab, ids: string[]): string[] {
  const set = new Set(ids);
  for (const n of tab.notes ?? []) if (n.attachedTo && set.has(n.attachedTo)) set.add(n.id);
  return [...set];
}

/** The ids among `ids` that a locked group holds. */
export function lockedAmong(tab: Tab, ids: string[]): string[] {
  return ids.filter((id) => groupOf(tab, id)?.locked);
}

/**
 * Gives every Hatch and note fresh ids, and carries those ids into attachments and groups.
 * A saved or closed canvas opens again this way, so two openings never share pages.
 */
export function freshIds<T extends Pick<Tab, 'hatches' | 'notes' | 'groups'>>(tab: T, fresh: (prefix: string) => string): T & { map: Map<string, string> } {
  const map = new Map<string, string>();
  for (const h of tab.hatches) map.set(h.id, fresh('hatch'));
  for (const n of tab.notes ?? []) map.set(n.id, fresh('note'));
  const notes = tab.notes?.map((n) => {
    const { attachedTo, ...rest } = n;
    const to = attachedTo ? map.get(attachedTo) : undefined;
    return { ...rest, id: map.get(n.id)!, ...(to ? { attachedTo: to } : {}) };
  });
  const groups = tab.groups?.map((g) => ({ ...g, id: fresh('group'), members: g.members.map((m) => map.get(m)).filter((m): m is string => !!m) })).filter((g) => g.members.length >= 2);
  return {
    ...tab,
    hatches: tab.hatches.map((h) => ({ ...h, id: map.get(h.id)! })),
    ...(notes ? { notes } : {}),
    ...(groups ? { groups } : {}),
    map,
  };
}
