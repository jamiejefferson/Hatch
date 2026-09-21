import { contextBridge, ipcRenderer } from 'electron';
import type { HatchApi, Pushes } from './api';

const PUSHES: (keyof Pushes)[] = ['command', 'activity:event', 'agents:work', 'agent:act', 'page:changed', 'page:escape', 'popup:blocked', 'dialog:state', 'projects:state', 'projects:log', 'links:state', 'comments:changed', 'signins:state', 'consent:state', 'connection:state', 'toast'];

const api: HatchApi = {
  intro: process.env.HATCH_INTRO === '1' || !process.env.HATCH_HIDDEN,
  guide: process.env.HATCH_GUIDE !== '0',
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: (workspace) => ipcRenderer.invoke('workspace:save', workspace),
  listLinks: () => ipcRenderer.invoke('links:list'),
  addLink: (link) => ipcRenderer.invoke('links:add', link),
  removeLink: (id) => ipcRenderer.invoke('links:remove', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  hasJevKey: () => ipcRenderer.invoke('jev:has-key'),
  setJevKey: (key) => ipcRenderer.invoke('jev:set-key', key),
  jevKeyHint: () => ipcRenderer.invoke('jev:key-hint'),
  jevProvider: () => ipcRenderer.invoke('jev:provider'),
  testJev: () => ipcRenderer.invoke('jev:test'),
  copyText: (text) => ipcRenderer.invoke('clipboard:copy', text),
  copyForPaper: (html) => ipcRenderer.invoke('clipboard:paper', html),
  bindHatch: (hatchId, webContentsId) => ipcRenderer.send('hatch:bind', hatchId, webContentsId),
  pickFolder: (title) => ipcRenderer.invoke('folder:pick', title),
  setFitHatches: (ids) => ipcRenderer.send('hatch:fit', ids),
  projects: () => ipcRenderer.invoke('projects:state'),
  pickProject: () => ipcRenderer.invoke('projects:pick'),
  addProject: (folder) => ipcRenderer.invoke('projects:add', folder),
  updateProject: (name, change) => ipcRenderer.invoke('projects:update', name, change),
  removeProject: (name) => ipcRenderer.invoke('projects:remove', name),
  startProject: (name) => ipcRenderer.invoke('projects:start', name),
  stopProject: (name) => ipcRenderer.invoke('projects:stop', name),
  projectLog: (name) => ipcRenderer.invoke('projects:log', name),
  refreshProjects: () => ipcRenderer.invoke('projects:refresh'),
  connection: () => ipcRenderer.invoke('connection:info'),
  openSetupExamples: () => ipcRenderer.invoke('connection:examples'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  signIns: () => ipcRenderer.invoke('signins:list'),
  addSignIn: (input) => ipcRenderer.invoke('signins:add', input),
  removeSignIn: (id) => ipcRenderer.invoke('signins:remove', id),
  setSignInAllow: (id, allow) => ipcRenderer.invoke('signins:allow', id, allow),
  browserProfiles: () => ipcRenderer.invoke('signins:browsers'),
  importSignIn: (pageUrl, profileId) => ipcRenderer.invoke('signins:import', pageUrl, profileId),
  answerConsent: (hatchId, answer) => ipcRenderer.invoke('consent:answer', hatchId, answer),
  comments: (url) => ipcRenderer.invoke('comments:read', url),
  addComment: (url, input) => ipcRenderer.invoke('comments:add', url, input),
  replyComment: (url, id, text) => ipcRenderer.invoke('comments:reply', url, id, text),
  setCommentStatus: (url, id, status) => ipcRenderer.invoke('comments:status', url, id, status),
  markCommentSeen: (url, id) => ipcRenderer.invoke('comments:seen', url, id),
  editComment: (url, id, index, text) => ipcRenderer.invoke('comments:edit', url, id, index, text),
  removeComment: (url, id) => ipcRenderer.invoke('comments:remove', url, id),
  defaultBrowser: () => ipcRenderer.invoke('browser:state'),
  makeDefaultBrowser: () => ipcRenderer.invoke('browser:make-default'),
  feedbackDetails: () => ipcRenderer.invoke('feedback:details'),
  captureForFeedback: () => ipcRenderer.invoke('feedback:capture'),
  sendFeedback: (input) => ipcRenderer.invoke('feedback:send', input),
  activity: () => ipcRenderer.invoke('activity:list'),
  openLog: () => ipcRenderer.invoke('activity:open-log'),
  readAgentView: (hatchId) => ipcRenderer.invoke('agent-view:read', hatchId),
  answerDialog: (hatchId, accept, text) => ipcRenderer.invoke('dialog:answer', hatchId, accept, text),
  on: (channel, listener) => {
    if (!PUSHES.includes(channel)) throw new Error(`Unknown channel ${channel}`);
    const handler = (_event: unknown, payload: Parameters<typeof listener>[0]): void => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  serve: (handler) => {
    ipcRenderer.removeAllListeners('rpc');
    ipcRenderer.on('rpc', async (_event, id: number, method: string, params: unknown) => {
      try {
        ipcRenderer.send('rpc:reply', id, true, await handler(method, params));
      } catch (error) {
        ipcRenderer.send('rpc:reply', id, false, error instanceof Error ? error.message : String(error));
      }
    });
    ipcRenderer.send('interface:ready');
  },
};

contextBridge.exposeInMainWorld('hatch', api);
