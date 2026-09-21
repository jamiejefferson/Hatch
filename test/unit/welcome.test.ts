import { describe, expect, it } from 'vitest';
import { welcomeLinks, welcomeWorkspace, whatsNewUrl, withUpdateTab } from '@shared/welcome';
import { repairWorkspace } from '@shared/workspace';

describe('welcomeWorkspace', () => {
  it('holds one selected Hatch in Fit to view with the sidebar closed, and survives repair as it is', () => {
    const made = welcomeWorkspace('https://guide.example/');
    const repaired = repairWorkspace(JSON.parse(JSON.stringify(made)));
    expect(repaired).toEqual(made);
    expect(repaired.sidebarOpen).toBe(false);
    expect(repaired.tabs[0]!.hatches[0]).toMatchObject({ url: 'https://guide.example/', template: 'fit' });
    expect(repaired.tabs[0]!.selectedHatchId).toBe(repaired.tabs[0]!.hatches[0]!.id);
  });
});

describe('welcomeLinks', () => {
  it('saves the guide and Google', () => {
    expect(welcomeLinks('https://guide.example/').map((l) => l.name)).toEqual(['Hatch guide', 'Google']);
  });
});

describe('withUpdateTab', () => {
  it('adds one front tab that holds the guide at #new in Fit to view, and keeps every tab the user had', () => {
    const before = repairWorkspace({ version: 1, sidebarOpen: true, activeTabId: 'tab_mine', tabs: [{ id: 'tab_mine', name: 'Shop', hatches: [], selectedHatchId: null, pan: { x: 40, y: 12 }, zoom: 0.5 }] });
    const after = repairWorkspace(JSON.parse(JSON.stringify(withUpdateTab(before, 'https://guide.example/'))));
    expect(after.tabs).toHaveLength(2);
    expect(after.tabs[0]).toEqual(before.tabs[0]);
    expect(after.activeTabId).toBe(after.tabs[1]!.id);
    expect(after.sidebarOpen).toBe(false);
    expect(after.tabs[1]).toMatchObject({ name: 'New in Hatch', hatches: [{ url: 'https://guide.example/#new', template: 'fit' }] });
    expect(after.tabs[1]!.selectedHatchId).toBe(after.tabs[1]!.hatches[0]!.id);
  });

  it('replaces an anchor the address already carries', () => {
    expect(whatsNewUrl('https://guide.example/#jev')).toBe('https://guide.example/#new');
  });
});
