// What a fresh install of Hatch holds before the user has done anything. Pure data, so unit tests cover it.
import type { SavedLink, Workspace } from './types';
import { emptyTab, newId } from './workspace';

/** The guide to Hatch, which a fresh install opens and keeps as Hatch Home. */
export const WELCOME_URL = 'https://hatch-guide.vercel.app/';

/** One Hatch in Fit to view with the sidebar closed, so Hatch first looks like an ordinary browser showing one page. */
export function welcomeWorkspace(url: string): Workspace {
  const tab = emptyTab();
  const hatch = { id: newId('hatch'), url, title: '', x: 0, y: 0, width: 960, height: 752, template: 'fit' as const, view: 'page' as const };
  return { version: 1, tabs: [{ ...tab, hatches: [hatch], selectedHatchId: hatch.id }], activeTabId: tab.id, sidebarOpen: false };
}

export const welcomeLinks = (url: string): SavedLink[] => [
  { id: newId('link'), name: 'Hatch guide', url },
  { id: newId('link'), name: 'Google', url: 'https://www.google.com/' },
];
