// Every live page is a webview guest. The registry applies Hatch's rules to each guest as it attaches,
// and keys everything on webContents.id so a different renderer surface could replace webviews later.
import { join } from 'node:path';
import { BrowserWindow, ipcMain, session, type WebContents } from 'electron';
import { PageSession } from '../cdp/session';
import { PAGES_PARTITION } from '../paths';

const ALLOWED_SCHEMES = ['http:', 'https:', 'file:', 'about:'];
const GRANTED_PERMISSIONS = new Set(['clipboard-sanitized-write']);

const pages = new Map<string, PageSession>();
const byGuest = new Map<number, PageSession>();
const waiters = new Map<string, ((page: PageSession) => void)[]>();
const observers = new Set<(page: PageSession) => void>();
/** The Hatches in Fit to view, which the interface reports. A pop-up opens for these alone. */
let fitHatches = new Set<string>();
export const setFitHatches = (ids: string[]): void => void (fitHatches = new Set(ids));

export const pageFor = (hatchId: string): PageSession | undefined => pages.get(hatchId);
export const allPages = (): PageSession[] => [...pages.values()];

/** Runs for every page as it binds, so other modules can listen to its events. */
export const onPageBound = (observer: (page: PageSession) => void): void => void observers.add(observer);

/** A Hatch the interface has just created takes a moment to attach its guest. */
export function waitForPage(hatchId: string, timeoutMs = 10_000): Promise<PageSession | undefined> {
  const known = pages.get(hatchId);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    const list = waiters.get(hatchId) ?? [];
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    list.push((page) => {
      clearTimeout(timer);
      resolve(page);
    });
    waiters.set(hatchId, list);
  });
}

export function bindHatch(hatchId: string, guest: WebContents): void {
  if (pages.get(hatchId)?.guest === guest) return;
  const page = new PageSession(hatchId, guest);
  pages.set(hatchId, page);
  byGuest.set(guest.id, page);
  const guestId = guest.id;
  guest.once('destroyed', () => {
    // A page that closes with a dialog open still holds a blocked call, which this releases.
    void page.dialog?.answer(false).catch(() => {});
    if (pages.get(hatchId) === page) pages.delete(hatchId);
    byGuest.delete(guestId);
  });
  // Opening DevTools on a Hatch takes the debugger away. Hatch takes it back when DevTools closes.
  // A focused page keeps its own Esc, so Hatch hears the key here and leaves Fit to view. The page still receives it.
  guest.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && !input.meta && !input.control && !input.alt) guest.hostWebContents?.send('page:escape', hatchId);
  });
  guest.on('devtools-closed', () => void page.attach().catch(() => {}));
  observers.forEach((o) => o(page));
  void page.attach().catch(() => {});
  waiters.get(hatchId)?.forEach((w) => w(page));
  waiters.delete(hatchId);
}

const asked = new Map<string, { guestId: number; settle(answer: unknown): void }>();
let askCount = 0;

/** Asks the script Hatch runs inside a page, which holds the one resolver for comment anchors. */
export function askGuest<T>(guest: WebContents, kind: string, payload: unknown, timeoutMs = 3000): Promise<T | null> {
  return new Promise((resolve) => {
    const requestId = `ask${++askCount}`;
    const timer = setTimeout(() => settle(null), timeoutMs);
    const settle = (answer: unknown): void => {
      clearTimeout(timer);
      asked.delete(requestId);
      resolve(answer as T | null);
    };
    asked.set(requestId, { guestId: guest.id, settle });
    if (guest.isDestroyed()) return settle(null);
    guest.send('hatch:ask', requestId, kind, payload);
  });
}

/**
 * Hatch 0.1.1 and earlier ran pages in the default session, because the partition was set too late to take effect.
 * The first start after that moves those cookies into the pages session, so nobody is signed out by the update.
 */
async function adoptOldCookies(): Promise<void> {
  const old = await session.defaultSession.cookies.get({});
  const jar = session.fromPartition(PAGES_PARTITION).cookies;
  for (const c of old) {
    const host = (c.domain ?? '').replace(/^\./, '');
    if (!host) continue;
    await jar
      .set({ url: `${c.secure ? 'https' : 'http'}://${host}${c.path ?? '/'}`, name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, ...(c.hostOnly ? {} : { domain: c.domain }), ...(c.session ? {} : { expirationDate: c.expirationDate }) })
      .catch(() => {});
    await session.defaultSession.cookies.remove(`${c.secure ? 'https' : 'http'}://${host}${c.path ?? '/'}`, c.name).catch(() => {});
  }
  if (old.length > 0) await jar.flushStore();
}

export function setUpPagesSession(): void {
  const partition = session.fromPartition(PAGES_PARTITION);
  void adoptOldCookies();
  partition.setPermissionRequestHandler((_wc, permission, grant) => grant(GRANTED_PERMISSIONS.has(permission)));
  partition.setPermissionCheckHandler((_wc, permission) => GRANTED_PERMISSIONS.has(permission));

  // The dialog stand-ins in the guest preload block the page on this call until someone answers.
  ipcMain.on('guest:dialog', (event, kind: string, message: string, fallback: string) => {
    const page = byGuest.get(event.sender.id);
    if (!page || !['alert', 'confirm', 'prompt'].includes(kind)) {
      event.returnValue = { accept: false, text: '' };
      return;
    }
    page.setDialog({
      kind: kind as 'alert' | 'confirm' | 'prompt',
      message,
      defaultText: fallback,
      answer: async (accept, text) => {
        event.returnValue = { accept, text: text ?? fallback };
      },
    });
  });
  ipcMain.on('guest:mutated', (event) => byGuest.get(event.sender.id)?.emitChanged());
  ipcMain.on('guest:answer', (event, requestId: string, answer: unknown) => {
    const waiting = asked.get(requestId);
    if (waiting?.guestId === event.sender.id) waiting.settle(answer);
  });
}

export function watchHost(host: WebContents): void {
  host.on('will-attach-webview', (event, webPreferences, params) => {
    const src = params.src ?? '';
    const scheme = URL.canParse(src) ? new URL(src).protocol : '';
    if (!ALLOWED_SCHEMES.includes(scheme)) {
      event.preventDefault();
      return;
    }
    // The page gets Hatch's own preload, never one of its choosing, and no Node access.
    webPreferences.preload = join(import.meta.dirname, '../preload/guest.cjs');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.backgroundThrottling = false;
    // The interface names the pages session on the element. A guest that asks for any other session never attaches.
    if (params.partition !== PAGES_PARTITION) {
      event.preventDefault();
      return;
    }
  });

  host.on('did-attach-webview', (_event, guest) => {
    // A pinch belongs to the canvas, so the page itself never zooms.
    void guest.setVisualZoomLevelLimits(1, 1);
    // A link that asks for a new window opens in the same Hatch.
    // A pop-up is a window the page opens with a size, which is how "Sign in with Google" works: the page and the pop-up talk to each other,
    // so loading it in the same Hatch breaks the sign-in. In Fit to view Hatch opens a real pop-up. On the canvas it refuses and tells the user.
    guest.setWindowOpenHandler(({ url, disposition }) => {
      const scheme = URL.canParse(url) ? new URL(url).protocol : '';
      const allowed = ALLOWED_SCHEMES.includes(scheme);
      if (disposition === 'new-window') {
        const hatchId = byGuest.get(guest.id)?.hatchId;
        if (hatchId && fitHatches.has(hatchId) && allowed) {
          const parent = BrowserWindow.fromWebContents(host) ?? undefined;
          return {
            action: 'allow',
            overrideBrowserWindowOptions: { width: 520, height: 680, parent, show: !process.env.HATCH_HIDDEN, autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } },
          };
        }
        if (hatchId) host.send('popup:blocked', { hatchId, url });
        return { action: 'deny' };
      }
      if (allowed && scheme !== 'about:') void guest.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
    // A page's "leave this page?" question would stall an agent and show the user nothing, so Hatch always lets the page go.
    guest.on('will-prevent-unload', (event) => event.preventDefault());
    guest.on('will-navigate', (event, url) => {
      const scheme = URL.canParse(url) ? new URL(url).protocol : '';
      if (!ALLOWED_SCHEMES.includes(scheme)) event.preventDefault();
    });
  });
}
