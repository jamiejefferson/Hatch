// Milestone A: an agent drives Hatch through the fixture site with no screenshot used for navigation,
// and a second agent's first call opens its own tab. The flow runs once per MCP protocol version.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

type Content = { type: string; text?: string; data?: string; mimeType?: string };
interface Result { text: string; isError: boolean; content: Content[] }

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

async function connect(url: string, agent: string, mode?: 'auto'): Promise<Client> {
  const client = new Client({ name: agent, version: '1.0.0' }, mode ? { versionNegotiation: { mode } } : undefined);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=${agent}`)));
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const r = (await client.callTool({ name, arguments: args })) as { content: Content[]; isError?: boolean };
  return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError, content: r.content };
}

const refOf = (outline: string, line: string): string => {
  const found = outline.split('\n').find((l) => l.includes(line));
  const ref = found?.match(/\[(e\d+)\]/)?.[1];
  if (!ref) throw new Error(`No reference for ${line} in:\n${outline}`);
  return ref;
};

let site: Awaited<ReturnType<typeof serveSite>>;
let app: ElectronApplication;
let win: Page;
let url: string;
let port: number;
const home = freshHome();

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  site = await serveSite();
  port = await freePort();
  ({ app, win } = await launch(home, port));
  url = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8')).url;
});
test.afterAll(async () => {
  await app?.close();
  await site.close();
});

for (const [label, mode] of [['current protocol', 'auto'], ['previous protocol', undefined]] as const) {
  test(`${label}: an agent completes a multi-page flow by reference`, async () => {
    const agent = await connect(url, mode ? 'alpha' : 'alpha-legacy', mode);
    expect(agent.getProtocolEra()).toBe(mode ? 'modern' : 'legacy');

    const tools = await agent.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['status', 'snapshot', 'click', 'fill', 'select_option', 'set_view', 'open_hatch']));

    expect((await call(agent, 'navigate', { to: `${site.url}/index.html`, intent: 'Open the pricing page.' })).text).toMatch(/loaded/i);
    const pricing = (await call(agent, 'snapshot')).text;
    expect(pricing).toContain('page "Pricing | Acme"');
    expect(pricing).toContain('heading 1 "Simple pricing"');
    expect((await call(agent, 'find', { query: 'link contact' })).text).toContain('link "Contact sales"');

    const contactLink = refOf(pricing, 'link "Contact sales"');
    const clicked = await call(agent, 'click', { ref: contactLink, intent: 'Open the contact form.' });
    expect(clicked.text).toContain('contact.html');

    // The old page's references died with it.
    const stale = await call(agent, 'click', { ref: contactLink });
    expect(stale.isError).toBe(true);
    expect(stale.text).toContain('Call snapshot');

    const form = (await call(agent, 'snapshot')).text;
    expect(form).toContain('textbox "Work email"');
    expect(form).toMatch(/textbox "Work email" \[e\d+\] \(required\)/);
    await call(agent, 'fill', { ref: refOf(form, 'textbox "Work email"'), text: 'sam@studio.example' });
    const chosen = await call(agent, 'select_option', { ref: refOf(form, 'combobox "Team size"'), option: '11 to 50' });
    expect(chosen.text).toContain('"11 to 50"');
    const wrong = await call(agent, 'select_option', { ref: refOf(form, 'combobox "Team size"'), option: 'Enormous' });
    expect(wrong.text).toContain('"More than 50"');
    await call(agent, 'fill', { ref: refOf(form, 'textbox "What do you need?"'), text: 'A quote for 30 seats.' });
    await call(agent, 'click', { ref: refOf(form, 'checkbox "Send me product updates"') });

    const filled = (await call(agent, 'snapshot', { root_ref: refOf(form, 'textbox "Work email"') })).text;
    expect(filled).toContain('value "sam@studio.example"');

    const sent = await call(agent, 'click', { ref: refOf(form, 'button "Send"') });
    expect(sent.text).toContain('thanks.html');
    expect((await call(agent, 'wait_for', { text: 'we will be in touch' })).text).toContain('The condition holds');
    const thanks = (await call(agent, 'snapshot')).text;
    expect(thanks).toContain('We will write to sam@studio.example. Team size: m. Updates: yes. Notes: A quote for 30 seats.');

    // A screenshot serves design judgement. The window is hidden, and the image still arrives at the page's own size.
    const shot = await call(agent, 'screenshot', { max_width: 960 });
    const image = shot.content.find((c) => c.type === 'image');
    expect(image?.mimeType).toBe('image/png');
    expect(Buffer.from(image!.data!, 'base64').readUInt32BE(16)).toBe(960);
    expect(shot.text).toMatch(/saved at .*screenshots/);

    expect((await call(agent, 'go_back')).text).toContain('contact.html');
    await call(agent, 'finish_working', { summary: 'Sent the contact form.' });
    await agent.close();
  });
}

test('dialogs block the page until the agent answers, and a covered element refuses the click', async () => {
  const agent = await connect(url, 'alpha', 'auto');
  await call(agent, 'navigate', { to: `${site.url}/contact.html` });
  let page = (await call(agent, 'snapshot')).text;

  const opened = await call(agent, 'click', { ref: refOf(page, 'button "Delete draft"') });
  expect(opened.text).toContain('confirm dialog: "Delete the draft?"');
  const blocked = await call(agent, 'snapshot');
  expect(blocked.isError).toBe(true);
  expect(blocked.text).toContain('handle_dialog');
  await expect(win.getByTestId('page-dialog')).toContainText('Delete the draft?');
  await call(agent, 'handle_dialog', { accept: true });
  await expect(win.getByTestId('page-dialog')).toBeHidden();
  expect((await call(agent, 'snapshot')).text).toContain('Draft deleted.');

  // prompt() throws in Electron, so a stand-in carries it.
  page = (await call(agent, 'snapshot')).text;
  expect((await call(agent, 'click', { ref: refOf(page, 'button "Rename draft"') })).text).toContain('prompt dialog: "Name this draft"');
  await call(agent, 'handle_dialog', { accept: true, text: 'Q3 quote' });
  expect((await call(agent, 'snapshot')).text).toContain('Name: Q3 quote');

  // The user can answer a dialog too.
  page = (await call(agent, 'snapshot')).text;
  await call(agent, 'click', { ref: refOf(page, 'button "Delete draft"') });
  await win.getByTestId('page-dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect.poll(async () => (await call(agent, 'snapshot')).text).toContain('Draft kept.');

  await call(agent, 'click', { ref: refOf(page, 'button "Show the cookie banner"') });
  page = (await call(agent, 'snapshot')).text;
  const covered = await call(agent, 'click', { ref: refOf(page, 'button "Below the banner"') });
  // The button sits at the foot of the page, under the fixed banner, so Hatch refuses and names what covers it.
  expect(covered.isError).toBe(true);
  expect(covered.text).toContain('<div#cover.on>');
  await call(agent, 'click', { ref: refOf(page, 'button "Show the cookie banner"') }).catch(() => {});

  const gated = await call(agent, 'evaluate', { expression: 'document.title' });
  expect(gated.isError).toBe(true);
  expect(gated.text).toContain('switched off');
  await agent.close();
});

test('a slow page returns at the timeout and wait_for picks it up', async () => {
  const agent = await connect(url, 'alpha', 'auto');
  const started = Date.now();
  const slow = await call(agent, 'navigate', { to: `${site.url}/slow`, timeout_s: 1 });
  expect(slow.isError).toBe(false);
  expect(slow.text).toContain('Still loading after 1 seconds');
  expect(Date.now() - started).toBeLessThan(2500);
  expect((await call(agent, 'wait_for', { text: 'Slow page arrived', timeout_s: 10 })).text).toContain('The condition holds');
  await agent.close();
});

test('set_view needs a reason, shows it to the user, and the agent view on screen matches the snapshot', async () => {
  const agent = await connect(url, 'alpha', 'auto');
  await call(agent, 'navigate', { to: `${site.url}/index.html` });
  const missing = await call(agent, 'set_view', { view: 'agent', reason: '' }).catch((e: Error) => ({ isError: true, text: e.message, content: [] }));
  expect(missing.isError).toBe(true);

  const asked = await call(agent, 'set_view', { view: 'agent', reason: 'The Docs link has no label in the outline.' });
  expect(asked.text).toContain('Requested');
  await expect(win.getByTestId('view-request')).toContainText('The Docs link has no label in the outline.');
  await win.getByTestId('view-request').getByRole('button', { name: 'Show the agent view' }).click();
  await expect(win.getByTestId('view-request')).toBeHidden();

  const outline = (await call(agent, 'snapshot')).text;
  await expect(win.locator('[data-testid^="agent-view-"] pre')).toHaveText(outline.trimEnd());

  await win.getByRole('tab', { name: 'Activity' }).click();
  await expect(win.getByTestId('activity-entry').filter({ hasText: 'Open the contact form.' }).first()).toBeVisible();
  await agent.close();
});

test('a second agent gets its own tab, and each agent sees only its own Hatches', async () => {
  const alpha = await connect(url, 'alpha', 'auto');
  const beta = await connect(url, 'beta');
  await call(alpha, 'status');
  const tabsBefore = await win.getByRole('tab').filter({ hasNot: win.locator('.sidebar *') }).count();

  expect((await call(beta, 'navigate', { to: `${site.url}/docs.html` })).text).toContain('docs.html');
  await expect(win.locator('.tabs [role="tab"]')).toHaveCount(2);
  expect(tabsBefore).toBeGreaterThan(0);

  const mine = (await call(alpha, 'list_hatches')).text;
  const theirs = (await call(beta, 'list_hatches')).text;
  expect(mine).not.toContain('docs.html');
  expect(theirs).toContain('docs.html');
  expect(theirs.split('\n')).toHaveLength(1);

  // beta works in a tab the user is not looking at, and reads and captures it all the same.
  expect((await call(beta, 'snapshot')).text).toContain('heading 1 "Getting started"');
  const shot = await call(beta, 'screenshot');
  expect(shot.content.some((c) => c.type === 'image')).toBe(true);

  const two = await call(beta, 'open_hatch', { to: `${site.url}/index.html`, preset: 'mobile' });
  expect(two.text).toContain('Opened Hatch');
  expect((await call(beta, 'list_hatches')).text).toContain('390 × 844');
  await Promise.all([alpha.close(), beta.close()]);
});

test('a request that carries an Origin header receives 403', async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  expect((await fetch(url, { method: 'POST', headers: { ...headers, origin: 'http://localhost:5173' }, body })).status).toBe(403);
  expect((await fetch(url, { method: 'POST', headers: { ...headers, 'sec-fetch-site': 'same-origin' }, body })).status).toBe(403);
  expect(((await (await fetch(url.replace('/mcp', '/'))).json()) as { name: string }).name).toBe('hatch');
});

test('a connected agent carries on after Hatch restarts', async () => {
  const agent = await connect(url, 'alpha', 'auto');
  expect((await call(agent, 'status')).isError).toBe(false);
  await win.waitForTimeout(600);
  await app.close();
  ({ app, win } = await launch(home, port));
  const after = await call(agent, 'status');
  expect(after.isError).toBe(false);
  expect(after.text).toContain('You are agent "alpha"');
  await agent.close();
});
