// The contextual canvas (Paper sketches 04 to 08): mixed selection, attached notes, groups, arrangement, lock, undo and context links,
// for the user and for an agent. Live pages must keep their state through every move.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { capture, freshHome, inPages, launch, serveSite } from './helpers';

type Content = { type: string; text?: string };

let app: ElectronApplication;
let win: Page;
let agent: Client;
let site: Awaited<ReturnType<typeof serveSite>>;
let home: string;

const tab = () => (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace).tabs[0]!;
/** The workspace saves 400 ms after a change. */
const settle = () => win.waitForTimeout(700);
const clipboard = () => app.evaluate(({ clipboard: c }) => c.readText());
const pressMenu = (label: string) =>
  app.evaluate(({ Menu }, name) => {
    const item = Menu.getApplicationMenu()!.items.flatMap((m) => m.submenu?.items ?? []).find((i) => i.label === name)!;
    item.click();
  }, label);
async function call(name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const r = (await agent.callTool({ name, arguments: args })) as { content: Content[]; isError?: boolean };
  return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError };
}
const header = (id: string) => win.getByTestId(`header-${id}`);
const loadIds = () => inPages<number>(app, 'window.__loadId ?? 0');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  site = await serveSite();
  home = freshHome();
  ({ app, win } = await launch(home, 0));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'scout', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=scout`)));
  for (const page of ['index.html', 'docs.html', 'gallery.html']) await call('open_hatch', { to: `${site.url}/${page}`, width: 640, height: 480 });
  await win.getByTestId('show-all').click();
  await settle();
});

test.afterAll(async () => {
  await agent.close().catch(() => {});
  await app.close();
  await site.close();
});

test('Shift-click and a Shift-drag build a mixed selection, which is no group', async () => {
  const [a, b] = tab().hatches;
  await header(a!.id).click();
  // One Hatch: the bar offers its context and a prompt, and nothing to arrange.
  await expect(win.getByTestId('selection-count')).toHaveText('1 Hatch');
  await expect(win.getByTestId('group-selection')).toHaveCount(0);

  await header(b!.id).click({ modifiers: ['Shift'] });
  await expect(win.getByTestId('selection-count')).toHaveText('2 selected');
  await expect(win.getByTestId('selection-outline')).toContainText('2 items selected · Not grouped');
  await capture(app, 'test-results/screens/29-selection.png');
  await expect(win.getByTestId(`in-selection-${b!.id}`)).toHaveCount(1);
  await settle();
  expect(tab().groups ?? []).toEqual([]);

  // A Shift-drag over the empty canvas draws a box around all three.
  await win.keyboard.press('Escape');
  const canvas = (await win.getByTestId('canvas').first().boundingBox())!;
  await win.keyboard.down('Shift');
  await win.mouse.move(canvas.x + 6, canvas.y + 6);
  await win.mouse.down();
  await win.mouse.move(canvas.x + canvas.width - 6, canvas.y + canvas.height - 6, { steps: 6 });
  await win.mouse.up();
  await win.keyboard.up('Shift');
  await expect(win.getByTestId('selection-count')).toHaveText('3 selected');
  // A plain drag on the canvas still pans.
  await win.keyboard.press('Escape');
});

test('a note dropped on a Hatch attaches, travels with it and detaches', async () => {
  const [a] = tab().hatches;
  await win.getByTestId('add-note').click();
  const placer = win.getByTestId('note-placer');
  const box = (await placer.boundingBox())!;
  await placer.click({ position: { x: box.width / 2, y: box.height - 90 } });
  await win.getByTestId('note-text').fill('Use this for the practical side.');
  await win.getByTestId('note-text').press('Escape');
  await settle();
  const note = tab().notes![0]!;
  const card = (await win.getByTestId(`note-${note.id}`).boundingBox())!;
  const target = (await win.getByTestId(`shield-${a!.id}`).boundingBox())!;
  await win.mouse.move(card.x + 30, card.y + 30);
  await win.mouse.down();
  await win.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await win.mouse.up();
  await expect(win.getByTestId(`note-${note.id}`).getByTestId('note-author')).toContainText('attached to Pricing | Acme');
  await settle();
  const attached = tab().notes![0]!;
  expect(attached.attachedTo).toBe(a!.id);

  // Dragging the Hatch's title takes the note along, and the page keeps its state.
  const before = await loadIds();
  const title = (await header(a!.id).boundingBox())!;
  await win.mouse.move(title.x + 30, title.y + title.height / 2);
  await win.mouse.down();
  await win.mouse.move(title.x + 30, title.y + title.height / 2 + 60, { steps: 6 });
  await win.mouse.up();
  await settle();
  const moved = tab();
  const dy = moved.hatches[0]!.y - a!.y;
  expect(dy).toBeGreaterThan(40);
  expect(moved.notes![0]!.y - attached.y).toBe(dy);
  expect(await loadIds()).toEqual(before);

  // Undo puts the Hatch and its note back.
  await pressMenu('Undo');
  await settle();
  expect([tab().hatches[0]!.y, tab().notes![0]!.y]).toEqual([a!.y, attached.y]);
});

test('Arrange tidies the selection, keeps page sizes and live pages, and Undo reverses it', async () => {
  const start = tab();
  const sizes = start.hatches.map((h) => [h.width, h.height]);
  const before = await loadIds();
  const other = start.hatches[2]!;
  // Two Hatches only: the third stays where it is.
  await header(start.hatches[0]!.id).click();
  await header(start.hatches[1]!.id).click({ modifiers: ['Shift'] });
  await win.getByTestId('arrange').click();
  await win.getByTestId('arrange-align').click();
  await capture(app, 'test-results/screens/35-arrange-menu.png');
  await win.getByTestId('arrange-align').click();
  await win.getByTestId('arrange-column').click();
  await expect(win.getByTestId('layout-notice')).toContainText('Arranged 3 items');
  await settle();
  const after = tab();
  expect(after.hatches.map((h) => [h.width, h.height])).toEqual(sizes);
  expect(after.hatches[0]!.x).toBe(after.hatches[1]!.x);
  expect(after.hatches[1]!.y).toBeGreaterThan(after.hatches[0]!.y + 480);
  expect([after.hatches[2]!.x, after.hatches[2]!.y]).toEqual([other.x, other.y]);
  // The attached note came along with its Hatch.
  expect(after.notes![0]!.x - after.hatches[0]!.x).toBe(start.notes![0]!.x - start.hatches[0]!.x);
  expect(await loadIds()).toEqual(before);

  await win.getByTestId('layout-undo').click();
  await settle();
  expect(tab().hatches.map((h) => [h.x, h.y])).toEqual(start.hatches.map((h) => [h.x, h.y]));
  await pressMenu('Redo');
  await settle();
  expect(tab().hatches[1]!.x).toBe(tab().hatches[0]!.x);

  // Align and Tidy up act on the selection too.
  await win.getByTestId('arrange').click();
  await win.getByTestId('arrange-align').click();
  await win.getByTestId('arrange-align-top').click();
  await settle();
  expect(tab().hatches[0]!.y).toBe(tab().hatches[1]!.y);
  await win.getByTestId('arrange').click();
  await win.getByTestId('arrange-tidy').click();
  await expect(win.getByTestId('layout-notice')).toBeVisible();
  await capture(app, 'test-results/screens/30-arranged.png');
});

test('Group names the selection, moves as one, locks, and lasts through a restart', async () => {
  const start = tab();
  await header(start.hatches[0]!.id).click();
  await header(start.hatches[1]!.id).click({ modifiers: ['Shift'] });
  await win.getByTestId('group-selection').click();
  const field = win.getByTestId('group-name-field');
  await field.fill('Starting references');
  await field.press('Enter');
  await expect(win.getByTestId('group-name').first()).toContainText('Starting references · 3 items');
  await expect(win.getByTestId('selection-count')).toHaveText('1 group');
  await capture(app, 'test-results/screens/31-group.png');

  // Dragging one member's title moves the whole group, and the third Hatch stays.
  const title = (await header(start.hatches[1]!.id).boundingBox())!;
  await win.mouse.move(title.x + 30, title.y + title.height / 2);
  await win.mouse.down();
  await win.mouse.move(title.x + 30, title.y + title.height / 2 + 50, { steps: 6 });
  await win.mouse.up();
  await settle();
  const moved = tab();
  const dy = moved.hatches[0]!.y - start.hatches[0]!.y;
  expect(dy).toBeGreaterThan(30);
  expect(moved.hatches[1]!.y - start.hatches[1]!.y).toBe(dy);
  expect(moved.hatches[2]!.y).toBe(start.hatches[2]!.y);

  // Locked, the group refuses a drag and an agent's arrangement.
  await win.getByTestId('group-name').first().click();
  await win.getByTestId('selection-more').click();
  await win.getByTestId('lock-group').click();
  await settle();
  const groupId = tab().groups![0]!.id;
  expect(tab().groups![0]!.locked).toBe(true);
  const refused = await call('arrange_items', { group: groupId, mode: 'row' });
  expect(refused.isError).toBe(true);
  expect(refused.text).toContain('locked group');
  await win.mouse.move(title.x + 30, title.y + 50 + title.height / 2);
  await win.mouse.down();
  await win.mouse.move(title.x + 130, title.y + 50 + title.height / 2, { steps: 6 });
  await win.mouse.up();
  await settle();
  expect(tab().hatches[0]!.x).toBe(moved.hatches[0]!.x);

  // The group survives a restart.
  await app.close();
  ({ app, win } = await launch(home, 0));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'scout', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=scout`)));
  await expect(win.getByTestId('group-name').first()).toContainText('Starting references · 3 items · Locked');
  const list = await call('list_groups');
  expect(list.text).toContain('"Starting references", locked by the user');

  // Unlock and ungroup: every Hatch and note stays.
  await win.getByTestId('group-name').first().click();
  await win.getByTestId('selection-more').click();
  await win.getByTestId('lock-group').click();
  await win.getByTestId('selection-more').click();
  await win.getByTestId('ungroup').click();
  await settle();
  expect([tab().groups ?? [], tab().hatches.length, tab().notes!.length]).toEqual([[], 3, 1]);
});

test('a context link keeps the chosen sources, and the prompt carries only what the user kept', async () => {
  const [a, b] = tab().hatches;
  const note = tab().notes![0]!;
  await header(a!.id).click();
  await win.getByTestId('copy-context').click();
  const link = await clipboard();
  expect(link).toMatch(/^hatch:@ctx_[a-z0-9]+$/);
  // The selection changes, and the link still names what the user chose.
  await header(b!.id).click({ modifiers: ['Shift'] });
  const context = await call('get_context', { link });
  expect(context.isError).toBe(false);
  expect(context.text).toContain(`Hatch ${a!.id}`);
  expect(context.text).toContain(`Note ${note.id} from the user, attached to Hatch ${a!.id}`);
  expect(context.text).not.toContain(`Hatch ${b!.id}`);

  // Add a prompt: Review lists the sources, and an unticked note stays out.
  await win.getByTestId('add-prompt').click();
  await expect(win.getByTestId('prompt-popover')).toContainText('Uses 2 Hatches and 1 note');
  await win.getByTestId('prompt-review').click();
  await win.getByTestId('prompt-review-list').getByRole('checkbox').nth(2).uncheck();
  await expect(win.getByTestId('prompt-popover')).toContainText('Uses 2 Hatches ·');
  await win.getByTestId('prompt-text').fill('Find three examples beyond laptops and phones.');
  await capture(app, 'test-results/screens/32-prompt.png');
  await win.getByTestId('copy-prompt').click();
  const copied = await clipboard();
  expect(copied).toContain('Find three examples beyond laptops and phones.');
  const second = copied.match(/hatch:@ctx_[a-z0-9]+/)![0];
  const read = await call('get_context', { link: second });
  expect(read.text).toContain('The user asks:\nFind three examples beyond laptops and phones.');
  expect(read.text).toContain(`Hatch ${b!.id}`);
  expect(read.text).not.toContain(`Note ${note.id}`);

  // A context link passed where a Hatch belongs points the agent at get_context.
  const wrong = await call('snapshot', { hatch: second });
  expect(wrong.text).toContain('Call get_context');
});

test('an agent attaches a note, groups its results and arranges only them', async () => {
  const [a, b, c] = tab().hatches;
  const finding = await call('add_note', { text: 'This one explains why repair matters.', hatch: c!.id });
  expect(finding.text).toContain(`attached to Hatch ${c!.id}`);
  const grouped = await call('group_items', { ids: [b!.id, c!.id], name: 'Results' });
  expect(grouped.isError).toBe(false);
  await settle();
  const before = tab();
  const group = before.groups!.find((g) => g.name === 'Results')!;
  const arranged = await call('arrange_items', { group: group.id, mode: 'row' });
  expect(arranged.isError).toBe(false);
  await settle();
  const after = tab();
  // The first Hatch, outside the group, did not move.
  expect([after.hatches[0]!.x, after.hatches[0]!.y]).toEqual([a!.x, a!.y]);
  expect(after.hatches[1]!.y).toBe(after.hatches[2]!.y);
  const agentNote = after.notes!.find((n) => n.author !== 'user')!;
  expect(agentNote.attachedTo).toBe(c!.id);
  // The user's note is untouched by the agent.
  expect(after.notes!.find((n) => n.author === 'user')!.text).toBe('Use this for the practical side.');
  await capture(app, 'test-results/screens/33-agent-results.png');
});

test('a press on the canvas takes the keyboard back from a page, so Select All selects the canvas', async () => {
  await win.keyboard.press('Escape');
  // A page holds the keyboard, as it does after the user clicks into it or an agent opens it.
  await win.evaluate(`document.querySelector('webview').focus()`);
  await win.mouse.click(700, 150);
  await pressMenu('Select All');
  await expect(win.getByTestId('selection-bar')).toBeVisible();
  await expect(win.getByTestId('selection-count')).toHaveText(/\d+ selected/);
});

test('the bar says how to select more, and a page that holds the keyboard keeps Select All and Undo', async () => {
  await win.keyboard.press('Escape');
  const [a, b] = tab().hatches;
  await header(a!.id).click();
  await expect(win.getByTestId('selection-hint')).toHaveText('Shift-click to add more');
  await capture(app, 'test-results/screens/34-selection-hint.png');
  await win.getByTestId('selection-count').hover();
  await expect(win.getByTestId('tooltip')).toContainText('Shift-drag on empty canvas');
  await header(b!.id).click({ modifiers: ['Shift'] });
  await expect(win.getByTestId('selection-hint')).toHaveCount(0);
  const count = await win.getByTestId('selection-count').textContent();
  await settle();
  const layout = JSON.stringify(tab().hatches.map((h) => [h.x, h.y]));
  // The user is typing in a page: its Select All and Undo stay with the page, and the canvas keeps its selection and layout.
  await win.evaluate(`document.querySelector('webview').focus()`);
  await pressMenu('Select All');
  await pressMenu('Undo');
  await settle();
  await expect(win.getByTestId('selection-count')).toHaveText(count!);
  expect(JSON.stringify(tab().hatches.map((h) => [h.x, h.y]))).toBe(layout);
});
