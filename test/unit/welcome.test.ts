import { describe, expect, it } from 'vitest';
import { welcomeLinks, welcomeWorkspace } from '@shared/welcome';
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
