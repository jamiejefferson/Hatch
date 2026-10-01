// Notes are post-its on the canvas: the user places, writes, moves and deletes them, an agent adds and reads them but never edits,
// they hide in Fit to view, and the Comments tab lists them with comments in one list (JJ, 1 Oct 2026).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { freshHome, launch, openHatch, serveSite } from './helpers';

type Content = { type: string; text?: string };

const notesIn = (home: string) => {
  try {
    return (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace).tabs[0]!.notes ?? [];
  } catch {
    return [];
  }
};

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as { content: Content[]; isError?: boolean };
  return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError };
}

test('the user writes a note on the canvas, an agent adds one, both list in Comments, and notes hide in Fit to view', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'scout', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=scout`)));
  try {
    await openHatch(win, `${site.url}/index.html`);

    // The note button puts the next click in note mode, and the note opens for typing where the click lands.
    await win.getByTestId('add-note').click();
    const placer = win.getByTestId('note-placer');
    const box = (await placer.boundingBox())!;
    await placer.click({ position: { x: box.width - 220, y: box.height - 200 } });
    await win.getByTestId('note-text').fill('Ask the client which plan sells most.');
    await win.getByTestId('note-text').press('Escape');
    await expect(win.getByTestId('note-text')).toHaveCount(0);
    await expect.poll(() => notesIn(home).map((n) => [n.text, n.author])).toEqual([['Ask the client which plan sells most.', 'user']]);

    // A note left empty goes away.
    await win.getByTestId('add-note').click();
    await placer.click({ position: { x: 120, y: box.height - 120 } });
    await win.getByTestId('note-text').press('Escape');
    await expect(win.locator('.note')).toHaveCount(1);

    // A drag moves the note, and the move lasts.
    const mine = notesIn(home)[0]!;
    const card = win.getByTestId(`note-${mine.id}`);
    const at = (await card.boundingBox())!;
    await win.mouse.move(at.x + 40, at.y + 20);
    await win.mouse.down();
    await win.mouse.move(at.x + 40, at.y + 100, { steps: 5 });
    await win.mouse.up();
    await expect.poll(() => notesIn(home)[0]!.y).toBeGreaterThan(mine.y);

    // An agent adds a note and reads them all. It has no way to change one.
    const added = await call(agent, 'add_note', { text: 'Sign in loses the remember-me box below 400 px.' });
    expect(added.isError).toBe(false);
    await expect(win.locator('.note')).toHaveCount(2);
    await expect(win.locator('.note').filter({ hasText: 'remember-me' })).toContainText('Agent · scout');
    const listed = await call(agent, 'list_notes');
    expect(listed.text).toContain('from the user');
    expect(listed.text).toContain('from scout');
    const tools = (await agent.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['add_note', 'list_notes']));
    expect(tools.filter((t) => /note/.test(t))).toHaveLength(2);

    // The Comments tab lists both notes in one list, and the Notes switch hides them.
    await win.getByTestId('panel-comments').click();
    await expect(win.getByTestId('note-row')).toHaveCount(2);
    await expect(win.getByTestId('note-row').first()).toContainText('Note · You');
    await win.getByTestId('list-notes').click();
    await expect(win.getByTestId('note-row')).toHaveCount(0);
    await win.getByTestId('list-notes').click();

    // In Fit to view the notes hide and the note button waits; picking a note in the list brings the canvas back.
    await win.getByTestId('hatch-list').locator('li').first().locator('.row-main').click();
    await win.getByTestId('fit-toggle').click();
    await expect(win.locator('.note')).toHaveCount(0);
    await expect(win.getByTestId('add-note')).toBeDisabled();
    await expect(win.getByTestId('notes-hidden')).toBeVisible();
    await win.getByTestId('note-row').first().click();
    await expect(win.locator('.top-strip .fit-bar')).toHaveCount(0);
    await expect(win.locator('.note.selected')).toHaveCount(1);

    // The user may delete any note, the agent's too.
    await win.getByTestId('note-row').filter({ hasText: 'remember-me' }).click();
    await expect(win.locator('.note.selected')).toContainText('remember-me');
    await win.getByTestId('note-delete').click();
    await expect(win.locator('.note')).toHaveCount(1);
    await expect.poll(() => notesIn(home).length).toBe(1);
  } finally {
    await agent.close();
    await app.close();
    await site.close();
  }
});
