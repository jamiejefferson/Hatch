import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateForSize } from '@shared/templates';
import { emptyWorkspace, repairWorkspace } from '@shared/workspace';
import { JsonStore } from '../../src/main/store/json-store';

describe('repairWorkspace', () => {
  it('returns a fresh workspace for missing or broken data', () => {
    for (const raw of [undefined, null, 'x', {}, { tabs: [] }, { tabs: [null] }]) {
      const w = repairWorkspace(raw);
      expect(w.tabs).toHaveLength(1);
      expect(w.activeTabId).toBe(w.tabs[0]!.id);
    }
  });

  it('round-trips a workspace', () => {
    const w = emptyWorkspace();
    w.tabs[0]!.hatches.push({ id: 'hatch_a', url: 'https://example.com/', title: 'Example', x: 0, y: 0, width: 960, height: 752, template: 'desktop', view: 'page' });
    w.tabs[0]!.selectedHatchId = 'hatch_a';
    expect(repairWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
  });

  it('drops Hatches with no address, clamps sizes and clears a stale selection', () => {
    const w = repairWorkspace({
      tabs: [{ id: 't', selectedHatchId: 'gone', zoom: 99, hatches: [{ id: 'a', url: '' }, { id: 'b', url: 'https://example.com/', width: 10, height: 99999, template: 'nonsense' }] }],
      activeTabId: 'missing',
    });
    expect(w.activeTabId).toBe('t');
    expect(w.tabs[0]!.selectedHatchId).toBeNull();
    expect(w.tabs[0]!.zoom).toBe(2);
    expect(w.tabs[0]!.hatches).toEqual([{ id: 'b', url: 'https://example.com/', title: '', x: 0, y: 0, width: 240, height: 4000, template: 'custom', view: 'page' }]);
  });

  it('lets one selected Hatch at most fill the window', () => {
    const hatch = (id: string) => ({ id, url: 'https://example.com/', width: 960, height: 752, template: 'fit' });
    const w = repairWorkspace({ tabs: [{ id: 't', selectedHatchId: 'b', hatches: [hatch('a'), hatch('b')] }] });
    expect(w.tabs[0]!.hatches.map((h) => h.template)).toEqual(['desktop', 'fit']);
  });
});

describe('templateForSize', () => {
  it('names a matching template and calls the rest custom', () => {
    expect(templateForSize(390, 844)).toBe('mobile');
    expect(templateForSize(391, 844)).toBe('custom');
  });
});

describe('JsonStore', () => {
  const repair = (raw: unknown): { n: number } => ({ n: typeof (raw as { n?: unknown })?.n === 'number' ? (raw as { n: number }).n : 0 });

  it('writes atomically, in order', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'hatch-store-')), 'deep', 'value.json');
    const store = new JsonStore(path, repair);
    expect(await store.read()).toEqual({ n: 0 });
    await Promise.all([1, 2, 3].map((n) => store.write({ n })));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ n: 3 });
  });

  it('moves an unreadable file aside and never overwrites it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hatch-store-'));
    const path = join(dir, 'value.json');
    writeFileSync(path, '{ broken');
    const store = new JsonStore(path, repair);
    expect(await store.read()).toEqual({ n: 0 });
    const kept = readdirSync(dir).find((f) => f.startsWith('value.json.unreadable-'));
    expect(kept && readFileSync(join(dir, kept), 'utf8')).toBe('{ broken');
  });
});
