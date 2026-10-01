import { join } from 'node:path';
import { BrowserWindow, screen, shell, type Rectangle } from 'electron';
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
  // The interface hears no blur of its own while a page holds the focus, and needs one to hand the keyboard back (canvas/keyboard.ts).
  win.on('blur', () => !win.webContents.isDestroyed() && win.webContents.send('window:blur', null));
  watchFullScreen(win);
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

/** How far from the left edge the handle starts to fade in, in pixels. */
const EDGE_REACH = 160;

/**
 * Tells the interface when the window enters and leaves full screen, because the toolbar tucks away at the edge in full screen alone.
 * In full screen it also reports how far the pointer sits from the left edge, so the handle fades in as the pointer nears it.
 * The main process asks the system for the pointer, because a page under the pointer keeps its moves from Hatch's interface.
 */
function watchFullScreen(win: BrowserWindow): void {
  const send = <T>(channel: string, value: T): void => void (!win.webContents.isDestroyed() && win.webContents.send(channel, value));
  let timer: ReturnType<typeof setInterval> | null = null;
  let last = -1;
  const track = (): void => {
    if (win.isDestroyed()) return;
    const b = win.getContentBounds();
    const p = screen.getCursorScreenPoint();
    const inside = p.y >= b.y && p.y < b.y + b.height && p.x >= b.x && win.isFocused();
    const distance = inside ? Math.min(p.x - b.x, EDGE_REACH) : EDGE_REACH;
    if (distance !== last) send('pointer:edge', (last = distance));
  };
  const set = (full: boolean): void => {
    send('window:fullscreen', full);
    if (timer) clearInterval(timer);
    timer = full ? setInterval(track, 33) : null;
    last = -1;
  };
  win.on('enter-full-screen', () => set(true));
  win.on('leave-full-screen', () => set(false));
  win.on('closed', () => timer && clearInterval(timer));
}
