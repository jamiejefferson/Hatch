import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const SITE = resolve('test/fixtures/site');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

export function serveSite(): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/whoami') {
      // A page behind a sign-in: it names the session cookie the browser sent, which the cookie import test reads.
      const session = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>Account</title><h1 id="who">${session ? `Signed in as ${session}` : 'Signed out'}</h1>`);
      return;
    }
    if (path === '/slow') {
      // A page that takes three seconds, for the timeout tests.
      setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Slow page</title><h1>Slow page arrived</h1>'), 3000);
      return;
    }
    if (path === '/first-compile') {
      // A dev server's first compile: the answer takes longer than open_hatch waits for a new page to register.
      setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Compiled</title><h1>Compiled page arrived</h1>'), 12_000);
      return;
    }
    try {
      const file = join(SITE, path === '/' ? 'index.html' : path);
      if (!file.startsWith(SITE)) throw new Error('outside');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      ok({ url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

export const freshHome = (): string => mkdtempSync(join(tmpdir(), 'hatch-e2e-'));

export async function launch(home: string, mcpPort = 0, extraEnv: Record<string, string> = {}): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, HATCH_HOME: home, HATCH_MCP_PORT: String(mcpPort), HATCH_PROXY_PORT: '0', HATCH_HIDDEN: process.env.HATCH_SHOW ? '' : '1', HATCH_GUIDE: '0', HATCH_WELCOME: '0', ...extraEnv } });
  const win = await app.firstWindow();
  await win.waitForSelector('[data-testid="canvas"]');
  return { app, win };
}

/** Runs JavaScript inside every live page and returns the results in the order the pages attached. */
export function inPages<T>(app: ElectronApplication, expression: string): Promise<T[]> {
  return app.evaluate(async ({ webContents }, js) => {
    const guests = webContents.getAllWebContents().filter((wc) => wc.getType() === 'webview').sort((a, b) => a.id - b.id);
    return Promise.all(guests.map((g) => g.executeJavaScript(js, true)));
  }, expression) as Promise<T[]>;
}

/** The zoom control and the list of Hatches show in the Hatch panel while no Hatch is selected. */
export async function showCanvasPanel(win: Page): Promise<void> {
  await win.getByTestId('panel-hatch').click();
  const back = win.getByRole('button', { name: 'Show all Hatches' });
  if (await back.isVisible()) await back.click();
}

export async function openHatch(win: Page, address: string): Promise<void> {
  await win.getByTestId('panel-hatch').click();
  await win.getByTestId('new-hatch').click();
  await win.getByTestId('new-hatch-url').fill(address);
  await win.getByTestId('new-hatch-url').press('Enter');
  await win.getByTestId('new-hatch-modal').waitFor({ state: 'hidden' });
}

/**
 * Saves an image of the window. Playwright's own screenshot overrides the device metrics for a moment,
 * which resizes every live page to the window's width, so the capture goes through Electron instead.
 */
export async function capture(app: ElectronApplication, path: string): Promise<void> {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(png, 'base64'));
}
