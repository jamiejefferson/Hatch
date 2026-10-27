import { describe, expect, it } from 'vitest';
import { applyMoves, arrange, freshIds, groupOf, lockedAmong, unitsFor, withAttached, type Unit } from '@shared/arrange';
import type { Hatch, Note, Tab } from '@shared/types';

const hatch = (id: string, x: number, y: number, width = 400, height = 300): Hatch => ({ id, url: 'https://example.com/', title: id, x, y, width, height, template: 'custom', view: 'page' });
const note = (id: string, x: number, y: number, attachedTo?: string): Note => ({ id, text: id, x, y, author: 'user', createdAt: '', ...(attachedTo ? { attachedTo } : {}) });
const tab = (over: Partial<Tab>): Tab => ({ id: 't', hatches: [], selectedHatchId: null, pan: { x: 0, y: 0 }, zoom: 1, ...over });
const m = { note: { width: 100, height: 80 }, title: 20 };
const unit = (id: string, x: number, y: number, width = 100, height = 100): Unit => ({ id, box: { x, y, width, height } });
const placed = (units: Unit[], moves: Map<string, { dx: number; dy: number }>) =>
  Object.fromEntries(units.map((u) => [u.id, [u.box.x + (moves.get(u.id)?.dx ?? 0), u.box.y + (moves.get(u.id)?.dy ?? 0)]]));

describe('arranging a selection', () => {
  const units = [unit('a', 0, 0), unit('b', 300, 30), unit('c', 20, 400)];

  it('tidies into rows by their tops, keeping the order', () => {
    expect(placed(units, arrange(units, 'tidy', 10))).toEqual({ a: [0, 0], b: [110, 0], c: [0, 110] });
  });

  it('lays out a row, a column and a grid', () => {
    expect(placed(units, arrange(units, 'row', 10))).toEqual({ a: [0, 0], c: [110, 0], b: [220, 0] });
    expect(placed(units, arrange(units, 'column', 10))).toEqual({ a: [0, 0], b: [0, 110], c: [0, 220] });
    expect(placed(units, arrange(units, 'grid', 10))).toEqual({ a: [0, 0], b: [110, 0], c: [0, 110] });
  });

  it('aligns edges and centres to the selection', () => {
    const mixed = [unit('a', 0, 0, 100, 50), unit('b', 200, 100, 50, 100)];
    expect(placed(mixed, arrange(mixed, 'align-right'))).toEqual({ a: [150, 0], b: [200, 100] });
    expect(placed(mixed, arrange(mixed, 'align-bottom'))).toEqual({ a: [0, 150], b: [200, 100] });
    expect(placed(mixed, arrange(mixed, 'align-centre'))).toEqual({ a: [75, 0], b: [100, 100] });
  });

  it('distributes evenly between the first and the last', () => {
    const row = [unit('a', 0, 0), unit('b', 150, 0), unit('c', 500, 0)];
    expect(placed(row, arrange(row, 'distribute-horizontal'))).toEqual({ a: [0, 0], b: [250, 0], c: [500, 0] });
    expect(arrange(row.slice(0, 2), 'distribute-horizontal').size).toBe(0);
  });

  it('leaves out units that do not move', () => {
    expect(arrange([unit('a', 0, 0)], 'tidy').size).toBe(0);
  });
});

describe('Hatches with attached notes', () => {
  const t = tab({ hatches: [hatch('h1', 0, 100), hatch('h2', 1000, 100)], notes: [note('n1', 0, 420, 'h1'), note('n2', 600, 900)] });

  it('measures a Hatch with its title room and its attached notes', () => {
    expect(unitsFor(t, ['h1', 'n1', 'n2'], m)).toEqual([
      { id: 'h1', box: { x: 0, y: 80, width: 400, height: 420 } },
      { id: 'n2', box: { x: 600, y: 900, width: 100, height: 80 } },
    ]);
  });

  it('moves an attached note with its Hatch and leaves other items alone', () => {
    const moved = applyMoves(t, new Map([['h1', { dx: 50, dy: 10 }]]));
    expect(moved.hatches.map((h) => [h.x, h.y])).toEqual([[50, 110], [1000, 100]]);
    expect(moved.notes!.map((n) => [n.x, n.y])).toEqual([[50, 430], [600, 900]]);
    // The page keeps its size.
    expect(moved.hatches[0]!.width).toBe(400);
  });

  it('finds an attached note through its Hatch for groups and context', () => {
    const grouped = { ...t, groups: [{ id: 'g', name: 'G', members: ['h1', 'n2'], locked: true }] };
    expect(groupOf(grouped, 'n1')?.id).toBe('g');
    expect(withAttached(grouped, ['h1']).sort()).toEqual(['h1', 'n1']);
    expect(lockedAmong(grouped, ['h1', 'h2', 'n1'])).toEqual(['h1', 'n1']);
  });

  it('gives fresh ids and carries them into attachments and groups', () => {
    let i = 0;
    const out = freshIds({ ...t, groups: [{ id: 'g', name: 'G', members: ['h1', 'n2'] }] }, (p) => `${p}-${++i}`);
    const h1 = out.map.get('h1')!;
    expect(out.notes!.find((n) => n.text === 'n1')!.attachedTo).toBe(h1);
    expect(out.groups![0]!.members).toEqual([h1, out.map.get('n2')]);
  });
});
