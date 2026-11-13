import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const SITE = resolve('test/fixtures/site');
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

/** Stand-in Google Docs, which the tests reach as HATCH_GOOGLE_DOCS_HOSTS. Each id behaves as one kind of document. */
export const DOCS = { plain: 'standindoc000000000000001', textOnly: 'standindoc000000000000002', private: 'standindoc000000000000003', long: 'standindoc000000000000004' };
export const DOC_OPENING = '# The Slop of the New\n\nI read an article written by an LLM about the English language this morning.\n\n## What went wrong\n\n- Every sentence had three parts.\n';
export const LONG_DOC = `# A long draft\n\n${Array.from({ length: 600 }, (_, i) => `Paragraph ${i + 1} of the long draft says something worth reading.`).join('\n\n')}\n\nThe last line of the long draft.`;

/** The editor draws its words on a canvas, as Google Docs does, and the export answers only to the sign-in cookie the editor set. */
function serveDoc(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, id: string, part: string): void {
  if (part === 'edit') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'docs_sid=signed-in; Path=/' });
    res.end('<title>The Slop of the New - Google Docs</title><div role="toolbar"><button>File</button><button>Edit</button><button>Share</button></div><canvas width="800" height="600"></canvas><script>document.querySelector("canvas").getContext("2d").fillText("The Slop of the New", 40, 40)</script>');
    return;
  }
  const format = new URL(req.url ?? '/', 'http://x').searchParams.get('format');
  const signedIn = /(?:^|; )docs_sid=signed-in/.test(req.headers.cookie ?? '');
  if (id === DOCS.private || !signedIn) {
    res.writeHead(401, { 'content-type': 'text/html' }).end('<title>Sign in</title>');
    return;
  }
  if (id === DOCS.textOnly && format === 'md') {
    res.writeHead(400, { 'content-type': 'text/html' }).end('Bad format');
    return;
  }
  const body = id === DOCS.long ? LONG_DOC : id === DOCS.textOnly ? '\uFEFFThe Slop of the New\r\n\r\n\r\n\r\nPlain text only.' : DOC_OPENING;
  res.writeHead(200, { 'content-type': format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8' }).end(body);
}

export function serveSite(): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/whoami') {
      // A page behind a sign-in: it names the session cookie the browser sent, which the cookie import test reads.
      const session = /(?:^|; )session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>Account</title><h1 id="who">${session ? `Signed in as ${session}` : 'Signed out'}</h1>`);
      return;
    }
    if (path === '/suggest') {
      // Stands in for Google's suggestions, in the same shape.
      const q = new URL(req.url ?? '/', 'http://x').searchParams.get('q') ?? '';
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([q, [q, `${q} fonts`, `${q} academy`]]));
      return;
    }
    if (path === '/slow') {
      // A page that takes three seconds, for the timeout tests.
      setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Slow page</title><h1>Slow page arrived</h1>'), 3000);
      return;
    }
    if (path === '/api/results') {
      // A search service that answers after 800 ms, for the tests that check a reply waits for the page's own request.
      const q = new URL(req.url ?? '/', 'http://x').searchParams.get('q') ?? '';
      setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([`First result for ${q}`, `Second result for ${q}`])), 800);
      return;
    }
    if (path === '/first-compile') {
      // A dev server's first compile: the answer takes longer than open_hatch waits for a new page to register.
      setTimeout(() => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Compiled</title><h1>Compiled page arrived</h1>'), 12_000);
      return;
    }
    const doc = /^\/document\/d\/([\w-]+)\/(edit|export)$/.exec(path);
    if (doc) return serveDoc(req, res, doc[1]!, doc[2]!);
    try {
      const file = join(SITE, path === '/' ? 'index.html' : path);
      if (!file.startsWith(SITE)) throw new Error('outside');
      // The file is read before the headers go, so a missing file still answers 404.
      const content = readFileSync(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(content);
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

/** The list of canvases and Hatches sits in the left column's Canvases tab. The zoom sits in the toolbar. */
export async function showCanvasPanel(win: Page): Promise<void> {
  await win.getByTestId('left-canvases').click();
}

export async function openHatch(win: Page, address: string): Promise<void> {
  await win.getByTestId('left-canvases').click();
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
