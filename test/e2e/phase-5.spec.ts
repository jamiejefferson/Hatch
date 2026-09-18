// Phase 5: an agent measures an element for design work, and Hatch fills a saved sign-in without showing the agent the password.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { capture, freshHome, inPages, launch, serveSite } from './helpers';

const PASSWORD = 'correct-horse-battery-staple-42';
const freePort = (): Promise<number> =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

let site: Awaited<ReturnType<typeof serveSite>>;
let app: ElectronApplication;
let win: Page;
let agent: Client;
const home = freshHome();
const replies: string[] = [];

const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
  const r = (await agent.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean };
  const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  replies.push(text);
  return { text, isError: !!r.isError };
};
const refOf = (outline: string, line: string): string => outline.split('\n').find((l) => l.includes(line))!.match(/\[(e\d+)\]/)![1]!;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  site = await serveSite();
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ allowEvaluate: true }));
  ({ app, win } = await launch(home, await freePort()));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'designer', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=designer`)));
});
test.afterAll(async () => {
  await app?.close();
  await site.close();
});

test('get_element measures a paragraph and reports its failing contrast', async () => {
  await call('navigate', { to: `${site.url}/login.html` });
  const outline = (await call('snapshot')).text;
  const measured = await call('get_element', { ref: refOf(outline, 'Low contrast helper text') });
  expect(measured.isError, measured.text).toBe(false);
  expect(measured.text).toContain('<p#quiet.quiet>');
  expect(measured.text).toMatch(/\d+ × \d+ px at x 48/);
  expect(measured.text).toMatch(/text contrast 2\.\d+:1 against #ffffff, which fails WCAG AA/);
  expect(measured.text).toContain('font-size: 16px');
  expect(measured.text).toContain('color: rgb(153, 153, 153)');
});

test('the user saves a sign-in, and no file holds the password as text', async () => {
  await win.getByRole('tab', { name: 'Sign-ins' }).click();
  await win.getByTestId('signin-site').fill(`${site.url}/login.html`);
  await win.getByTestId('signin-username').fill('sam@studio.example');
  await win.getByTestId('signin-password').fill(PASSWORD);
  await win.getByRole('button', { name: 'Save this sign-in' }).click();
  await expect(win.locator('.signin-list')).toContainText('sam@studio.example');
  await expect(win.locator('.signin-list')).toContainText('Asks each time');
  await expect(win.getByTestId('signin-password')).toHaveValue('');

  const listed = await call('list_credentials');
  expect(listed.text).toContain(`${new URL(site.url).host}  sam@studio.example`);
  for (const name of readdirSync(home).filter((n) => n.endsWith('.json'))) expect(readFileSync(join(home, name), 'utf8'), name).not.toContain(PASSWORD);
});

test('a fill waits for the user, fills the form, and hides values from the agent until the page navigates', async () => {
  const filling = call('fill_credentials', { timeout_s: 30 });
  await expect(win.getByTestId('consent')).toContainText('sam@studio.example');
  await win.getByRole('tab', { name: 'Activity' }).click();
  await expect(win.getByTestId('waiting-for-you')).toBeVisible();
  await capture(app, 'test-results/screens/14-sign-in-consent.png');
  expect(await inPages<string>(app, `document.querySelector('[name=password]').value`)).toEqual(['']);

  await win.getByRole('button', { name: 'Allow once' }).click();
  const filled = await filling;
  expect(filled.isError, filled.text).toBe(false);
  expect(filled.text).toMatch(/^filled: the username and the password/);
  expect(await inPages<string>(app, `document.querySelector('[name=email]').value + '|' + document.querySelector('[name=password]').value`)).toEqual([`sam@studio.example|${PASSWORD}`]);

  const outline = (await call('snapshot')).text;
  expect(outline).not.toContain('sam@studio.example');
  expect((await call('evaluate', { expression: 'document.querySelector("[name=password]").value' })).text).toContain('blocks page scripting');

  await call('click', { ref: refOf(outline, 'button "Sign in"') });
  await expect.poll(async () => (await call('snapshot')).text).toContain(`Signed in as sam@studio.example:${PASSWORD.length}`);
  expect((await call('evaluate', { expression: '1 + 1' })).text).toContain('2');
});

test('a refusal reaches the agent, and "always" stops the question', async () => {
  await call('navigate', { to: `${site.url}/login.html` });
  const refused = call('fill_credentials', { timeout_s: 30 });
  await win.getByRole('button', { name: 'Refuse' }).click();
  expect((await refused).text).toContain('the user refused');
  expect(await inPages<string>(app, `document.querySelector('[name=password]').value`)).toEqual(['']);

  const always = call('fill_credentials', { timeout_s: 30 });
  await win.getByRole('button', { name: 'Always allow on this site' }).click();
  expect((await always).text).toMatch(/^filled/);
  await win.getByRole('tab', { name: 'Sign-ins' }).click();
  await expect(win.locator('.signin-list')).toContainText('Always allowed');

  await call('navigate', { to: `${site.url}/login.html` });
  expect((await call('fill_credentials', { timeout_s: 5 })).text).toMatch(/^filled/);
  await expect(win.getByTestId('consent')).toHaveCount(0);
});

test('a page with no saved sign-in fails with a reason, and the password appears in no reply and no log', async () => {
  await call('navigate', { to: 'https://example.com/' });
  const none = await call('fill_credentials', { timeout_s: 5 });
  expect(none.isError).toBe(true);
  expect(none.text).toContain('saved no sign-in for example.com');

  expect(replies.join('\n')).not.toContain(PASSWORD);
  const logs = join(home, 'logs');
  for (const name of readdirSync(logs)) expect(readFileSync(join(logs, name), 'utf8'), name).not.toContain(PASSWORD);
});
