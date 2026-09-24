import { join } from 'node:path';
import { BrowserWindow, shell, type Rectangle } from 'electron';
import { watchHost } from './hatches/registry';

/** Opens Hatch's window. A window that replaces one whose renderer died takes that window's place on screen. */
export function createWindow(bounds?: Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(bounds ?? {}),
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
