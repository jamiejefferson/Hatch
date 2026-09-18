import { DEFAULT_SETTINGS, type SavedLink, type Settings, type Workspace } from '@shared/types';
import { repairWorkspace } from '@shared/workspace';
import { dataFile } from '../paths';
import { JsonStore } from './json-store';
import { cleanFolder, linksFile } from './folders';

function repairLinks(raw: unknown): SavedLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is SavedLink => !!l && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.url === 'string');
}

function repairSettings(raw: unknown): Settings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    newHatchPage: typeof source.newHatchPage === 'string' ? source.newHatchPage : DEFAULT_SETTINGS.newHatchPage,
    askBeforeViewSwitch: typeof source.askBeforeViewSwitch === 'boolean' ? source.askBeforeViewSwitch : DEFAULT_SETTINGS.askBeforeViewSwitch,
    allowEvaluate: typeof source.allowEvaluate === 'boolean' ? source.allowEvaluate : DEFAULT_SETTINGS.allowEvaluate,
    showComments: typeof source.showComments === 'boolean' ? source.showComments : DEFAULT_SETTINGS.showComments,
    guideSeen: source.guideSeen === true,
    linksFolder: cleanFolder(source.linksFolder),
    commentsFolder: cleanFolder(source.commentsFolder),
  };
}

export const workspaceStore = new JsonStore<Workspace>(dataFile('workspace.json'), repairWorkspace);
export const linksStore = new JsonStore<SavedLink[]>(linksFile, repairLinks);
export const settingsStore = new JsonStore<Settings>(dataFile('settings.json'), repairSettings);
