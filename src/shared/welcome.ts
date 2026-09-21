// What a fresh install of Hatch holds before the user has done anything. Pure data, so unit tests cover it.
import type { SavedLink, Workspace } from './types';
import { emptyTab, newId } from './workspace';

/** The part of the guide that says what changed, which Hatch opens once after an update. */
export const whatsNewUrl = (url: string): string => `${url.split('#')[0]}#new`;

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

/** After an update the guide opens in a tab of its own, in Fit to view with the sidebar closed. Every tab the user had stays as they left it. */
export function withUpdateTab(workspace: Workspace, url: string): Workspace {
  const tab = emptyTab();
  const hatch = { id: newId('hatch'), url: whatsNewUrl(url), title: '', x: 0, y: 0, width: 960, height: 752, template: 'fit' as const, view: 'page' as const };
  return { ...workspace, tabs: [...workspace.tabs, { ...tab, name: 'New in Hatch', hatches: [hatch], selectedHatchId: hatch.id }], activeTabId: tab.id, sidebarOpen: false };
}
