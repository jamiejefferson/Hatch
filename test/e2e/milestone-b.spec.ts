// Milestone B: on a real project the user pins a comment, and an agent reads it, acts on it, replies and resolves it.
// The project is a real Vite dev server, and the agent's code change reaches the Hatch by hot reload.
import { cpSync, existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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
let hatchId = '';
let commentId = '';
const home = freshHome();
const project = join(freshHome(), 'launch');
const commentFile = join(project, '.hatch', 'comments', 'index.md');

const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
  const r = (await agent.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean };
  return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError };
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  cpSync(resolve('test/fixtures/vite-project'), project, { recursive: true });
  symlinkSync(resolve('node_modules'), join(project, 'node_modules'));
  ({ app, win } = await launch(home, await freePort()));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'builder', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=builder`)));

  await call('register_project', { folder: project });
  const started = await call('start_server', { name: 'launch', timeout_s: 60 });
  expect(started.isError, started.text).toBe(false);
  const opened = await call('navigate', { to: 'hatch:launch' });
  hatchId = opened.text.match(/hatch_\w+/)![0];
  await expect.poll(async () => (await call('snapshot')).text, { timeout: 10_000 }).toContain('Served by Vite');
});
test.afterAll(async () => {
  await call('stop_server', { name: 'launch' }).catch(() => {});
  await app?.close();
});

test('the user pins a comment to an element, and it lands in the project folder', async () => {
  await win.getByTestId(`header-${hatchId}`).click();
  await win.getByTestId('add-comment').click();

  // The heading sits at the top of the page. The click lands on it through Hatch's picker, so the page's own handlers never fire.
  const frame = (await win.locator('webview').boundingBox())!;
  const zoom = frame.width / 960;
  await win.getByTestId(`pick-${hatchId}`).click({ position: { x: 60 * zoom, y: 40 * zoom } });
  await win.getByTestId('composer').fill('Make this heading say "Launch week".');
  await win.getByTestId('composer').press('Enter');

  const pin = win.getByTestId('pin-1');
  await expect(pin).toBeVisible();
  await expect(win.getByTestId('thread')).toContainText('Make this heading say');

  // The pin sits on the heading's top right corner at the canvas zoom.
  const [h1] = await inPages<{ right: number; top: number }>(app, `(() => { const r = document.getElementById('heading').getBoundingClientRect(); return { right: r.right, top: r.top }; })()`);
  const box = (await pin.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (frame.x + h1!.right * zoom))).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - (frame.y + h1!.top * zoom))).toBeLessThan(3);

  const text = readFileSync(commentFile, 'utf8');
  expect(text).toContain('# Comments on /');
  expect(text).toContain('Make this heading say "Launch week".');
  expect(text).toContain('"id":"heading"');
  await capture(app, 'test-results/screens/12-comment-thread.png');
});

test('the agent reads the comment, acts on it, replies and resolves it', async () => {
  const list = await call('list_comments');
  expect(list.text).toContain('hatch:launch/');
  expect(list.text).toContain('Make this heading say');
  commentId = list.text.match(/c_\w+/)![0];

  const thread = await call('get_comment', { id: commentId });
  expect(thread.text).toMatch(/The element is on the page now: \[e\d+\]/);
  expect(thread.text).toContain('You, ');

  // The agent's action: a code change in the project, which Vite pushes to the Hatch.
  writeFileSync(join(project, 'heading.js'), "export const heading = 'Launch week';\n");
  await expect.poll(async () => (await call('snapshot')).text, { timeout: 10_000 }).toContain('heading 1 "Launch week"');

  await win.getByRole('button', { name: 'Close this thread' }).click();
  expect((await call('reply_comment', { id: commentId, text: 'The heading now reads "Launch week".' })).isError).toBe(false);
  await expect(win.getByTestId('pin-1')).toHaveClass(/unread/);
  await capture(app, 'test-results/screens/13-comment-unread.png');

  await win.getByTestId('pin-1').click();
  await expect(win.getByTestId('thread')).toContainText('Agent builder');
  await expect(win.getByTestId('thread')).toContainText('The heading now reads');
  await expect.poll(() => readFileSync(commentFile, 'utf8')).toContain('- unread: no');

  expect((await call('set_comment_status', { id: commentId, status: 'resolved' })).text).toContain('resolved');
  await expect(win.getByTestId('pin-1')).toHaveClass(/resolved/);
  expect((await call('list_comments')).text).toContain('No open comments');
});

test('a hand edit to the file shows in Hatch, and a file Hatch cannot read stays untouched', async () => {
  const original = readFileSync(commentFile, 'utf8');
  writeFileSync(commentFile, original.replace('The heading now reads', 'Edited by hand: the heading now reads'));
  await expect(win.getByTestId('thread')).toContainText('Edited by hand', { timeout: 6000 });

  const broken = readFileSync(commentFile, 'utf8').replace(/- anchor: .*/, '- anchor: {broken');
  writeFileSync(commentFile, broken);
  await expect(win.getByRole('alert').filter({ hasText: 'Hatch cannot read' })).toBeVisible({ timeout: 6000 });
  const refused = await call('reply_comment', { id: commentId, text: 'This must fail.' });
  expect(refused.isError).toBe(true);
  expect(readFileSync(commentFile, 'utf8')).toBe(broken);

  writeFileSync(commentFile, original);
  await expect(win.getByTestId('pin-1')).toBeVisible({ timeout: 6000 });
});

test('an agent pins its own comment, and a comment whose element has gone reports it', async () => {
  const outline = (await call('snapshot')).text;
  const ref = outline.split('\n').find((l) => l.includes('Three days of offers'))?.match(/\[(e\d+)\]/)?.[1];
  const target = ref ?? (await call('find', { query: 'Three days of offers' })).text.match(/\[(e\d+)\]/)?.[1];
  expect(target, outline).toBeTruthy();
  const added = await call('add_comment', { ref: target, text: 'This tagline has no offer dates.' });
  expect(added.isError, added.text).toBe(false);
  await expect(win.getByTestId('pin-2')).toHaveClass(/unread/);
  const secondId = added.text.match(/c_\w+/)![0];

  const page = join(project, 'index.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('<p class="tagline">Three days of offers</p>', ''));
  await expect.poll(async () => (await call('get_comment', { id: secondId })).text, { timeout: 10_000 }).toContain('Element not found');
  // The comment stays on its page: the pin waits at the Hatch's corner, marked as detached.
  await expect(win.getByTestId('pin-2')).toHaveClass(/detached/);
  await expect(win.locator('.thread-list li', { hasText: 'Three days of offers' })).toContainText('Element not found');
});

test('the user edits a message, hides the pins and deletes a thread', async () => {
  await win.getByTestId('pin-1').click().catch(() => {});
  if (!(await win.getByTestId('thread').isVisible())) await win.getByTestId('pin-1').click();
  await win.getByRole('button', { name: 'Edit this message' }).first().click();
  const editor = win.getByTestId('thread').getByTestId('composer').first();
  await editor.fill('Make this heading say "Launch week", in sentence case.');
  await editor.press('Enter');
  await expect(win.getByTestId('thread')).toContainText('edited');
  expect(readFileSync(commentFile, 'utf8')).toContain('· edited');

  await win.getByRole('switch', { name: 'Show comments on the page' }).click();
  await expect(win.getByTestId('pin-1')).toHaveCount(0);
  await win.getByRole('switch', { name: 'Show comments on the page' }).click();
  await expect(win.getByTestId('pin-1')).toBeVisible();

  await win.getByRole('button', { name: 'Delete this thread' }).click();
  await win.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(win.getByTestId('pin-1')).toHaveCount(0);
  expect(existsSync(commentFile)).toBe(true);
  expect(readFileSync(commentFile, 'utf8')).not.toContain('Launch week');
});
