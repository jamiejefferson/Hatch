import { describe, expect, it } from 'vitest';
import { cleanFolderName, groupLinks, putSavedCanvas, repairSavedCanvases, savedCanvasFromTab, tabFromSavedCanvas } from '@shared/canvases';
import type { Hatch, Tab } from '@shared/types';

const hatch = (id: string, template: Hatch['template'] = 'desktop'): Hatch => ({ id, url: `https://example.com/${id}`, title: id, x: 10, y: 20, width: 960, height: 752, template, view: 'page' });
const tab: Tab = { id: 'tab_a', hatches: [hatch('one'), hatch('two', 'fit')], selectedHatchId: 'two', pan: { x: 5, y: 6 }, zoom: 0.8 };

describe('saved canvases', () => {
  it('saves a tab under a name, with a Hatch in Fit to view returned to its size on the canvas', () => {
    const saved = savedCanvasFromTab(tab, '  Research  ', new Date('2026-09-24T10:00:00Z'));
    expect(saved.name).toBe('Research');
    expect(saved.savedAt).toBe('2026-09-24T10:00:00.000Z');
    expect(saved.hatches.map((h) => h.template)).toEqual(['desktop', 'desktop']);
    expect(saved.pan).toEqual({ x: 5, y: 6 });
    expect(saved.zoom).toBe(0.8);
  });

  it('opens as a new tab with fresh ids, so two openings never share a page', () => {
    const saved = savedCanvasFromTab(tab, 'Research');
    const a = tabFromSavedCanvas(saved);
    const b = tabFromSavedCanvas(saved);
    expect(a.name).toBe('Research');
    expect(a.id).not.toBe(b.id);
    expect(a.hatches.map((h) => h.id)).not.toContain('one');
    expect(a.hatches[0]!.id).not.toBe(b.hatches[0]!.id);
    expect(a.hatches.map((h) => h.url)).toEqual(['https://example.com/one', 'https://example.com/two']);
    expect(a.selectedHatchId).toBeNull();
  });

  it('replaces a pinned canvas by its id, so it keeps one copy, and two canvases may share a name', () => {
    const first = savedCanvasFromTab(tab, 'Research');
    const list = putSavedCanvas([], first);
    const again = savedCanvasFromTab({ ...tab, hatches: [hatch('three')] }, 'Research renamed', new Date(), first.id);
    const next = putSavedCanvas(list, again);
    expect(next).toHaveLength(1);
    expect(next[0]!.name).toBe('Research renamed');
    expect(next[0]!.hatches.map((h) => h.id)).toEqual(['three']);
    expect(putSavedCanvas(next, savedCanvasFromTab(tab, 'Research renamed'))).toHaveLength(2);
  });

  it('opens a pinned canvas linked to its copy, so the copy follows it again', () => {
    const saved = savedCanvasFromTab(tab, 'Research');
    expect(tabFromSavedCanvas(saved).savedId).toBe(saved.id);
  });

  it('reads canvases.json and leaves broken entries out', () => {
    const good = savedCanvasFromTab(tab, 'Research');
    const list = repairSavedCanvases([good, null, 'x', { id: 'canvas_x' }, { id: 'canvas_y', name: '   ' }, { id: 'canvas_z', name: 'Bare', hatches: [{ url: 'https://a.example/' }, {}], zoom: 99 }]);
    expect(list.map((c) => c.name)).toEqual(['Research', 'Bare']);
    expect(list[1]!.hatches).toHaveLength(1);
    expect(list[1]!.zoom).toBeLessThanOrEqual(4);
    expect(repairSavedCanvases(undefined)).toEqual([]);
  });
});

describe('links in folders', () => {
  it('groups links by folder in the order the folders appear, with loose links first', () => {
    const groups = groupLinks([{ id: '1', folder: 'Work' }, { id: '2' }, { id: '3', folder: 'Reading' }, { id: '4', folder: 'Work' }]);
    expect(groups.map((g) => [g.folder, g.links.map((l) => l.id)])).toEqual([
      ['', ['2']],
      ['Work', ['1', '4']],
      ['Reading', ['3']],
    ]);
    expect(groupLinks([{ id: '1', folder: 'Work' }]).map((g) => g.folder)).toEqual(['Work']);
  });

  it('trims a folder name and treats anything else as no folder', () => {
    expect(cleanFolderName('  Work ')).toBe('Work');
    expect(cleanFolderName('')).toBe('');
    expect(cleanFolderName(3)).toBe('');
    expect(cleanFolderName('x'.repeat(80))).toHaveLength(60);
  });
});

describe('notes on a canvas', () => {
  const note = (id: string, text: string, author = 'user') => ({ id, text, x: 100, y: 200, author, createdAt: '2026-10-01T12:00:00.000Z' });

  it('travel with a saved canvas and open with fresh ids', () => {
    const saved = savedCanvasFromTab({ ...tab, notes: [note('n1', 'Check the Team price'), note('n2', '   ')] }, 'Research');
    expect(saved.notes?.map((n) => n.text)).toEqual(['Check the Team price']);
    const opened = tabFromSavedCanvas(saved);
    expect(opened.notes?.[0]).toMatchObject({ text: 'Check the Team price', x: 100, y: 200, author: 'user' });
    expect(opened.notes?.[0]!.id).not.toBe('n1');
  });

  it('survive a repair, and a note with no words or a broken shape is dropped', () => {
    const [repaired] = repairSavedCanvases([{ ...savedCanvasFromTab(tab, 'R'), notes: [note('n1', 'Keep me', 'scout'), { id: 'n2', text: '' }, 'junk', { text: 'No place' }] }]);
    expect(repaired!.notes?.map((n) => [n.text, n.author, n.x])).toEqual([['Keep me', 'scout', 100], ['No place', 'user', 0]]);
  });
});
