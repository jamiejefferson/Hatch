import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { watchHost } from './hatches/registry';

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#F2F2F2',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 17 },
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/host.cjs'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  watchHost(win.webContents);
  win.once('ready-to-show', () => {
    if (!process.env.HATCH_HIDDEN) win.show();
  });
  // Hatch's own interface never navigates away and never opens windows.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  return win;
}
