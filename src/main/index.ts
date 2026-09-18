import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { setUpPagesSession } from './hatches/registry';
import { flushOutbox } from './feedback/send';
import { registerIpc } from './ipc';
import { noteMcpError, startMcp, stopMcp } from './mcp/http';
import { buildMenu } from './menu';
import { connectionInfo } from './connection';
import { callInterface, push, registerRpcReplies, setInterface } from './renderer-rpc';
import { publish, stopAllNow } from './servers/manager';
import { stopWatchingCommentFiles, watchCommentFiles } from './comments/store';
import { startProxy, stopProxy } from './servers/proxy';
import { closeWatchers, syncWatchers } from './servers/watch';
import { workspaceStore } from './store/stores';
import { createWindow } from './window';

// A test run keeps its own Electron profile, so it never collides with the user's Hatch.
if (process.env.HATCH_HOME) app.setPath('userData', join(process.env.HATCH_HOME, 'electron'));

// Pages and pop-ups see an ordinary Chrome. Google refuses a sign-in from a browser whose user agent names Electron or an app built on it.
app.userAgentFallback = app.userAgentFallback.replace(/ (?:hatch|electron)\/\S+/gi, '');

let mainWindow: BrowserWindow | null = null;

function open(): void {
  mainWindow = createWindow();
  setInterface(mainWindow.webContents);
  mainWindow.on('closed', () => {
    mainWindow = null;
    setInterface(null);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // hatch:name/page links from other apps open in a new Hatch. macOS registers the scheme for the packaged app only.
  // A link can arrive while Hatch is still starting, so the call repeats until the interface answers.
  const openLink = (link: string, triesLeft = 20): void => {
    void callInterface('openForUser', { input: link }).catch(() => triesLeft > 0 && setTimeout(() => openLink(link, triesLeft - 1), 500));
  };
  app.on('open-url', (event, link) => {
    event.preventDefault();
    openLink(link);
  });

  void app.whenReady().then(() => {
    if (app.isPackaged) app.setAsDefaultProtocolClient('hatch');
    setUpPagesSession();
    registerIpc();
    registerRpcReplies();
    void startProxy()
      .then(() => Promise.all([syncWatchers(), publish(true)]))
      .catch((error) => console.error('[proxy] Hatch could not open its project address port:', error));
    void startMcp()
      .catch((error) => {
        noteMcpError(error);
        console.error('[mcp] Hatch could not open its agent port:', error);
      })
      .finally(() => push('connection:state', connectionInfo()));
    watchCommentFiles();
    // Feedback that failed to send last time goes out now.
    setTimeout(() => void flushOutbox(), 5000);
    buildMenu(() => mainWindow);
    open();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) open();
    });
  });

  app.on('window-all-closed', () => {
    // Agents drive Hatch in the background in later phases; for now Hatch quits with its window.
    app.quit();
  });

  let flushed = false;
  app.on('before-quit', (event) => {
    if (flushed) return;
    event.preventDefault();
    flushed = true;
    stopAllNow();
    stopProxy();
    closeWatchers();
    stopWatchingCommentFiles();
    // Quitting never waits on an agent. A connected agent can hold a stream open, which would keep the endpoint from closing.
    const limit = new Promise((resolve) => setTimeout(resolve, 2000));
    void Promise.race([Promise.all([workspaceStore.settled(), stopMcp()]), limit]).finally(() => app.quit());
  });
}
