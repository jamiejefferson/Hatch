import { BrowserWindow, clipboard, dialog, ipcMain, shell, webContents } from 'electron';
import { parseAddress } from '@shared/address';
import type { FeedbackInput } from '@shared/feedback';
import type { SavedLink, Settings, Workspace } from '@shared/types';
import { newId, repairWorkspace } from '@shared/workspace';
import type { Anchor, CommentStatus } from '@shared/comments';
import { listActivity, logPath } from './agents/activity';
import { workState } from './agents/agents';
import { handleDialog, snapshot } from './cdp/actions';
import * as comments from './comments/store';
import { connectionInfo } from './connection';
import { answerConsent } from './credentials/fill';
import { defaultBrowserState, makeDefaultBrowser } from './default-browser';
import { captureForFeedback, feedbackDetails, sendFeedback } from './feedback/send';
import { importSignIn, listBrowserProfiles } from './credentials/import-cookies';
import { addSignIn, listSignIns, removeSignIn, setAllow } from './credentials/store';
import { bindHatch, onPageBound, pageFor, setFitHatches } from './hatches/registry';
import { mcpPort } from './mcp/http';
import { copyForPaper } from './paper';
import { hatchHome } from './paths';
import { push } from './renderer-rpc';
import { logOf, projectsState, publish, register, remove, start, stop, update } from './servers/manager';
import { syncWatchers } from './servers/watch';
import { cleanFolder, linksFile, setFolders } from './store/folders';
import { hasKey, setKey } from './jev/client';
import { linksStore, settingsStore, workspaceStore } from './store/stores';

export function registerIpc(): void {
  ipcMain.handle('workspace:load', () => workspaceStore.read());
  ipcMain.handle('workspace:save', (_e, workspace: Workspace) => workspaceStore.write(repairWorkspace(workspace)));

  ipcMain.handle('links:list', () => linksStore.read());
  ipcMain.handle('links:add', (_e, link: { name: string; url: string }) =>
    linksStore.update((links) => {
      if (links.some((l) => l.url === link.url)) return links;
      const saved: SavedLink = { id: newId('link'), name: String(link.name).trim() || link.url, url: String(link.url) };
      return [...links, saved];
    }),
  );
  ipcMain.handle('links:remove', (_e, id: string) => linksStore.update((links) => links.filter((l) => l.id !== id)));

  ipcMain.handle('settings:get', () => settingsStore.read());
  ipcMain.handle('settings:set', async (_e, settings: Partial<Settings>) => {
    const linksBefore = await linksStore.read();
    const fileBefore = linksFile();
    // The interface sends the fields that changed, and every other field keeps its saved value.
    const page = String(settings.newHatchPage ?? '').trim();
    const parsed = page ? parseAddress(page) : null;
    const newHatchPage = parsed?.ok && parsed.kind === 'url' ? parsed.url : parsed?.ok ? page : '';
    return settingsStore.update((current) => ({
      newHatchPage: typeof settings.newHatchPage === 'string' ? newHatchPage : current.newHatchPage,
      askBeforeViewSwitch: typeof settings.askBeforeViewSwitch === 'boolean' ? settings.askBeforeViewSwitch : current.askBeforeViewSwitch,
      allowEvaluate: typeof settings.allowEvaluate === 'boolean' ? settings.allowEvaluate : current.allowEvaluate,
      describeElements: typeof settings.describeElements === 'boolean' ? settings.describeElements : current.describeElements,
      showComments: typeof settings.showComments === 'boolean' ? settings.showComments : current.showComments,
      guideSeen: current.guideSeen || settings.guideSeen === true,
      linksFolder: typeof settings.linksFolder === 'string' ? cleanFolder(settings.linksFolder) : current.linksFolder,
      commentsFolder: typeof settings.commentsFolder === 'string' ? cleanFolder(settings.commentsFolder) : current.commentsFolder,
    })).then(async (saved) => {
      // The links file may have moved, so the interface reads the list again. Comments read fresh on every call.
      setFolders(saved);
      // A newly chosen folder that holds no links yet takes the list the user already has.
      if (linksFile() !== fileBefore && linksBefore.length > 0 && (await linksStore.read()).length === 0) await linksStore.write(linksBefore);
      push('links:state', await linksStore.read());
      return saved;
    });
  });
  ipcMain.handle('folder:pick', async (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: String(title), buttonLabel: 'Choose', properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });

  ipcMain.handle('clipboard:copy', (_e, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle('clipboard:paper', (_e, html: string) => copyForPaper(String(html)));

  // Errors reach the interface as text, so a panel can show them beside the field that caused them.
  const safely = <A extends unknown[], T>(work: (...args: A) => Promise<T>) => async (_e: unknown, ...args: A): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    try {
      return { ok: true, value: await work(...args) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  ipcMain.handle('projects:state', () => projectsState(true));
  ipcMain.handle('projects:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Add a project', message: 'Choose a project folder, or one HTML file.', buttonLabel: 'Add', properties: ['openDirectory', 'openFile'] as ('openDirectory' | 'openFile')[], filters: [{ name: 'Web pages', extensions: ['html', 'htm'] }] };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });
  ipcMain.handle('projects:add', safely(async (folder: string) => {
    const project = await register({ folder });
    await syncWatchers();
    return project;
  }));
  ipcMain.handle('projects:update', safely(async (name: string, change: Parameters<typeof update>[1]) => {
    const project = await update(name, change);
    await syncWatchers();
    return project;
  }));
  ipcMain.handle('projects:remove', safely(async (name: string) => {
    await remove(name);
    await syncWatchers();
  }));
  // The interface never waits for a server to come up. The state push tells it when the port opens.
  ipcMain.handle('projects:start', safely(async (name: string) => (await start(name, 0)).state));
  ipcMain.handle('projects:stop', safely((name: string) => stop(name)));
  ipcMain.handle('projects:log', (_e, name: string) => logOf(name));
  ipcMain.handle('projects:refresh', () => publish(true));

  // The interface names a page by its link. The store finds the file, so the interface never handles a path.
  ipcMain.handle('comments:read', safely((url: string) => comments.read(url)));
  ipcMain.handle('comments:add', safely(async (url: string, input: { anchor: Anchor; label: string; text: string }) => (await comments.add(url, { ...input, author: 'user' })).page));
  ipcMain.handle('comments:reply', safely(async (url: string, id: string, text: string) => comments.reply(await comments.read(url), id, text, 'user')));
  ipcMain.handle('comments:status', safely(async (url: string, id: string, status: CommentStatus) => comments.setStatus(await comments.read(url), id, status === 'resolved' ? 'resolved' : 'open')));
  ipcMain.handle('comments:seen', safely(async (url: string, id: string) => comments.markSeen(await comments.read(url), id)));
  ipcMain.handle('comments:edit', safely(async (url: string, id: string, index: number, text: string) => comments.editMessage(await comments.read(url), id, Number(index), text)));
  ipcMain.handle('comments:remove', safely(async (url: string, id: string) => comments.removeThread(await comments.read(url), id)));

  // A password travels one way: from the form to the main process. No handler returns one.
  ipcMain.handle('signins:list', () => listSignIns());
  ipcMain.handle('signins:add', safely((input: { site: string; username: string; password: string }) => addSignIn(input)));
  ipcMain.handle('signins:remove', safely((id: string) => removeSignIn(String(id))));
  ipcMain.handle('signins:allow', safely((id: string, allow: 'ask' | 'always') => setAllow(String(id), allow)));
  // Cookies travel from the other browser's file into Hatch's session inside the main process. The interface learns the count alone.
  ipcMain.handle('signins:browsers', () => listBrowserProfiles());
  ipcMain.handle('signins:import', safely((pageUrl: string, profileId: string) => importSignIn(String(pageUrl), String(profileId))));
  // The key goes in and never comes back out. The interface learns only whether Hatch holds one.
  ipcMain.handle('jev:has-key', () => hasKey());
  ipcMain.handle('jev:set-key', safely((key: string) => setKey(String(key))));
  ipcMain.handle('consent:answer', (_e, hatchId: string, answer: 'once' | 'always' | 'refuse') => answerConsent(String(hatchId), answer === 'once' || answer === 'always' ? answer : 'refuse'));

  ipcMain.handle('connection:info', () => connectionInfo());
  ipcMain.handle('connection:examples', () => shell.openPath(connectionInfo().examples));
  ipcMain.handle('data:open-folder', () => shell.openPath(hatchHome()));

  ipcMain.handle('browser:state', () => defaultBrowserState());
  ipcMain.handle('browser:make-default', () => makeDefaultBrowser());

  ipcMain.handle('feedback:details', () => feedbackDetails());
  ipcMain.handle('feedback:capture', (event) => captureForFeedback(event.sender));
  ipcMain.handle('feedback:send', safely((input: FeedbackInput) => sendFeedback(input)));

  ipcMain.handle('activity:list', () => ({ entries: listActivity(), work: workState(), logPath: logPath(), port: mcpPort() }));
  ipcMain.handle('activity:open-log', () => shell.showItemInFolder(logPath()));

  // The agent view a Hatch displays is the same string snapshot returns to an agent.
  ipcMain.handle('agent-view:read', async (_e, hatchId: string) => {
    const page = pageFor(hatchId);
    if (!page) return 'This page is still opening.';
    try {
      return await snapshot(page);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  ipcMain.handle('dialog:answer', async (_e, hatchId: string, accept: boolean, text?: string) => {
    const page = pageFor(hatchId);
    if (page?.dialog) await handleDialog(page, accept, text).catch(() => {});
  });

  onPageBound((page) => {
    let timer: NodeJS.Timeout | null = null;
    page.onChanged(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        push('page:changed', page.hatchId);
      }, 300);
    });
    page.onDialog(() => {
      const d = page.dialog;
      push('dialog:state', { hatchId: page.hatchId, dialog: d ? { hatchId: page.hatchId, kind: d.kind, message: d.message, defaultText: d.defaultText } : null });
    });
  });

  ipcMain.on('hatch:fit', (_event, ids: string[]) => setFitHatches(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []));

  ipcMain.on('hatch:bind', (event, hatchId: string, webContentsId: number) => {
    const guest = webContents.fromId(webContentsId);
    // Only a guest of the window that sent the message may bind.
    if (guest && guest.hostWebContents === event.sender) bindHatch(hatchId, guest);
  });
}
