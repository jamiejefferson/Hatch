// Phase 3: a project answers at hatch:<name>, a static folder reloads when a file changes,
// and an agent registers, starts, reads and stops a dev server.
import { cpSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { capture, freshHome, inPages, launch } from './helpers';

const freePort = (): Promise<number> =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

let app: ElectronApplication;
let win: Page;
let agent: Client;
const home = freshHome();
const staticDir = join(freshHome(), 'brochure');
const devDir = join(freshHome(), 'shop');
const viteDir = join(freshHome(), 'campaign');

const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
  const r = (await agent.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean };
  return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError };
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  cpSync(resolve('test/fixtures/static-project'), staticDir, { recursive: true });
  cpSync(resolve('test/fixtures/dev-project'), devDir, { recursive: true });
  cpSync(resolve('test/fixtures/vite-project'), viteDir, { recursive: true });
  // The fixture borrows this repo's Vite, so the test needs no install.
  symlinkSync(resolve('node_modules'), join(viteDir, 'node_modules'));
  ({ app, win } = await launch(home, await freePort()));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'builder', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=builder`)));
});
test.afterAll(async () => {
  await app?.close();
});

test('an agent registers a static folder and reads it at its hatch: address', async () => {
  const registered = await call('register_project', { folder: staticDir });
  expect(registered.text).toContain('hatch:brochure');

  const opened = await call('navigate', { to: 'hatch:brochure' });
  expect(opened.isError, opened.text).toBe(false);
  expect(opened.text).toContain('at hatch:brochure (');
  const home = await call('snapshot');
  expect(home.text).toContain('Static project home');
  expect(home.text).toContain('hatch:brochure');

  const about = await call('navigate', { to: 'hatch:brochure/pages/about.html' });
  expect(about.text).toContain('hatch:brochure/pages/about.html');
  expect((await call('snapshot')).text).toContain('About this project');

  await call('navigate', { to: 'hatch:brochure/.env' });
  expect((await call('snapshot')).text).toContain('Nothing here');
});

test('a static page reloads when its file changes', async () => {
  await call('navigate', { to: 'hatch:brochure' });
  const file = join(staticDir, 'index.html');
  writeFileSync(file, readFileSync(file, 'utf8').replace('Static project home', 'Edited on disk'));
  await expect.poll(async () => (await call('snapshot')).text, { timeout: 8000 }).toContain('Edited on disk');
});

test('an agent starts a dev server, reads its page and its log, then stops it', async () => {
  const registered = await call('register_project', { folder: devDir });
  expect(registered.text).toMatch(/hatch:shop\s+Node/);

  const started = await call('start_server', { name: 'shop', timeout_s: 40 });
  expect(started.isError, started.text).toBe(false);
  expect(started.text).toMatch(/shop is running on port \d+/);

  await call('navigate', { to: 'hatch:shop/basket' });
  const page = await call('snapshot');
  expect(page.text).toContain('Dev project on shop.localhost');
  expect(page.text).toContain('Path /basket');

  expect((await call('get_server_logs', { name: 'shop' })).text).toContain('ready on http://127.0.0.1:');
  expect((await call('list_projects')).text).toMatch(/hatch:shop\s+Node\s+running on port \d+/);

  await call('stop_server', { name: 'shop' });
  await expect.poll(async () => (await call('list_projects')).text, { timeout: 8000 }).toMatch(/hatch:shop\s+Node\s+stopped/);
  await call('navigate', { to: 'hatch:shop' });
  expect((await call('snapshot')).text).toContain('shop is not running');
});

test('a Vite project loads through its named address and hot-reloads an edit', async () => {
  expect((await call('register_project', { folder: viteDir })).text).toMatch(/hatch:campaign\s+Vite/);
  const started = await call('start_server', { name: 'campaign', timeout_s: 60 });
  expect(started.isError, started.text).toBe(false);

  await call('navigate', { to: 'hatch:campaign' });
  await expect.poll(async () => (await call('snapshot')).text, { timeout: 10_000 }).toContain('Served by Vite');

  // The edit reaches the page only when Vite's websocket passes through Hatch's proxy.
  writeFileSync(join(viteDir, 'heading.js'), "export const heading = 'Edited while running';\n");
  await expect.poll(async () => (await call('snapshot')).text, { timeout: 10_000 }).toContain('Edited while running');
  expect((await call('get_console', {})).text).not.toMatch(/websocket|failed to connect/i);

  await call('stop_server', { name: 'campaign' });
});

test('an unknown project name gets a clear answer', async () => {
  const r = await call('navigate', { to: 'hatch:nothing-here' });
  expect(r.isError).toBe(true);
  expect(r.text).toContain('list_projects');
});

test('the Projects panel lists the projects and starts one for the user', async () => {
  await call('navigate', { to: 'hatch:shop' });
  await win.getByRole('tab', { name: 'Projects' }).click();
  await expect(win.locator('.project-list .name', { hasText: 'brochure' })).toBeVisible();
  await expect(win.locator('.project-list .name', { hasText: 'shop' })).toBeVisible();
  await expect(win.locator('.project-list .name', { hasText: 'campaign' })).toBeVisible();
  await capture(app, 'test-results/screens/10-projects-panel.png');

  await win.locator('.project-main', { hasText: 'shop' }).click();
  await expect(win.locator('.badge')).toHaveText('Stopped');
  await win.getByTestId('project-start').click();
  await expect(win.locator('.badge')).toHaveText('Running', { timeout: 40_000 });
  await expect(win.getByTestId('server-log')).toContainText('ready on');
  // The waiting page refreshes itself, so the Hatch picks the server up with no action from the user.
  await expect.poll(async () => (await inPages<string>(app, 'document.title')).includes('Dev project'), { timeout: 8000 }).toBe(true);
  await capture(app, 'test-results/screens/11-project-detail.png');

  await win.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(win.locator('.badge')).toHaveText('Stopped', { timeout: 10_000 });
});

test('the link field shows a project page in its hatch: form', async () => {
  await win.getByRole('tab', { name: 'Projects' }).click();
  await win.getByRole('button', { name: 'All projects' }).click();
  await win.locator('.project-list li', { hasText: 'brochure' }).getByRole('button', { name: 'Open' }).click();
  await expect.poll(async () => (await inPages<string>(app, 'location.hostname')).filter((h) => h === 'brochure.localhost').length).toBeGreaterThan(0);
  await win.getByRole('tab', { name: 'Hatch', exact: true }).click();
  await expect(win.getByTestId('link-field')).toHaveValue('hatch:brochure');
});
