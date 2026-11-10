import { describe, expect, it } from 'vitest';
import { matchRecent, notePage, RECENT_LIMIT, repairRecent, titlePage } from '@shared/recent';
import { emptyWorkspace, repairWorkspace } from '@shared/workspace';

describe('recent pages', () => {
  it('puts the newest page first and lists a page once, whatever follows its #', () => {
    let list = notePage([], 'https://a.com/');
    list = notePage(list, 'https://b.com/');
    list = notePage(list, 'https://a.com/#pricing');
    expect(list.map((p) => p.url)).toEqual(['https://a.com/#pricing', 'https://b.com/']);
  });

  it('keeps an earlier title until the page sends its own, and a title leaves the order alone', () => {
    let list = notePage([], 'https://a.com/', 'Alpha');
    list = notePage(list, 'https://b.com/');
    list = notePage(list, 'https://a.com/');
    expect(list[0]).toEqual({ url: 'https://a.com/', title: 'Alpha' });
    list = titlePage(list, 'https://b.com/', 'Beta');
    expect(list.map((p) => p.title)).toEqual(['Alpha', 'Beta']);
  });

  it('skips blank and error pages and keeps fifty pages at most', () => {
    expect(notePage([], 'about:blank')).toEqual([]);
    expect(notePage([], 'data:text/html,x')).toEqual([]);
    let list: ReturnType<typeof notePage> = [];
    for (let i = 0; i < RECENT_LIMIT + 5; i++) list = notePage(list, `https://site${i}.com/`);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]!.url).toBe(`https://site${RECENT_LIMIT + 4}.com/`);
  });

  it('narrows to the pages that hold every typed word', () => {
    const list = [
      { url: 'https://stripe.com/pricing', title: 'Pricing' },
      { url: 'https://linear.app/', title: 'Linear plans' },
    ];
    expect(matchRecent(list, '').length).toBe(2);
    expect(matchRecent(list, 'stripe PRICING').map((p) => p.url)).toEqual(['https://stripe.com/pricing']);
    expect(matchRecent(list, 'plans linear').map((p) => p.url)).toEqual(['https://linear.app/']);
    expect(matchRecent(list, 'figma')).toEqual([]);
  });

  it('repairs what workspace.json holds and survives a round trip', () => {
    expect(repairRecent('x')).toEqual([]);
    expect(repairRecent([null, { url: 'https://a.com/', title: 3 }, { url: 'https://a.com/', title: 'Later' }, { url: 'javascript:alert(1)' }])).toEqual([{ url: 'https://a.com/', title: 'Later' }]);
    const w = { ...emptyWorkspace(), recent: [{ url: 'https://a.com/', title: 'A' }, { url: 'https://b.com/', title: '' }] };
    expect(repairWorkspace(JSON.parse(JSON.stringify(w)))).toEqual(w);
    expect(repairWorkspace({ recent: w.recent }).recent).toEqual(w.recent);
    expect('recent' in repairWorkspace(emptyWorkspace())).toBe(false);
  });
});
