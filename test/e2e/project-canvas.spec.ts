// A canvas may belong to a working folder, the folder where a project's work takes place, so an agent working there uses
// that canvas and leaves the user's other canvases alone. Any folder counts, with or without a dev server. A new canvas
// asks which folder it belongs to, the Projects panel attaches and detaches, Hatch writes .hatch/canvas.json in the folder,
// and an agent finds its canvas by folder (the user, 5 Oct 2026).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type Page } from '@playwright/test';
import type { Workspace } from '@shared/types';
import { capture, freshHome, launch } from './helpers';

type Content = { type: string; text?: string };
const tabs = (home: string): Workspace['tabs'] => (JSON.parse(readFileSync(join(home, 'workspace.json'), 'utf8')) as Workspace).tabs;

async function connect(url: string, query: string): Promise<(name: string, args?: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>> {
  const client = new Client({ name: 'agent', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}?${query}`)));
  return async (name, args = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: Content[]; isError?: boolean };
    return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n'), isError: !!r.isError };
  };
}

const canvasRow = (win: Page, label: string) => win.getByTestId('canvas-list').locator('li').filter({ has: win.getByRole('tab', { name: label, exact: true }) });

test('a new canvas attaches to a working folder, an agent in that folder works there, and the Projects panel detaches it', async () => {
  const work = mkdtempSync(join(tmpdir(), 'hatch-folders-'));
  // The work takes place in a plain folder that is no website.
  const brief = join(work, 'client-brief');
  mkdirSync(join(brief, 'docs'), { recursive: true });
  const site = join(work, 'brochure');
  mkdirSync(site);
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>Brochure</title><h1>Brochure home</h1>');
  const loose = join(work, 'scratch');
  mkdirSync(loose);
  const home = freshHome();
  // An agent worked in the brief's folder before, so the question offers it.
  writeFileSync(join(home, 'work-folders.json'), JSON.stringify([brief]));
  const { app, win } = await launch(home, 0);
  try {
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const setup = await connect(url, 'agent=setup');
    expect((await setup('register_project', { folder: site })).text).toContain('hatch:brochure');

    // A new canvas asks which folder it is for, and attaching names the canvas after the folder.
    await win.getByTestId('left-canvases').click();
    await win.getByTestId('new-canvas').click();
    await expect(win.getByTestId('attach-modal')).toBeVisible();
    await expect(win.getByTestId('attach-choose')).toBeVisible();
    await capture(app, 'test-results/screens/attach-canvas.png');
    await win.getByTestId('attach-to-client-brief').click();
    await expect(win.getByTestId('attach-modal')).toBeHidden();
    await expect(canvasRow(win, 'client-brief').getByTestId('canvas-folder')).toBeVisible();
    await expect.poll(() => tabs(home).find((t) => t.folder === brief)?.id ?? '').not.toBe('');
    const briefCanvas = tabs(home).find((t) => t.folder === brief)!.id;

    // Hatch tells an agent in the folder which canvas is its own, and keeps the note out of the folder's history.
    const note = join(brief, '.hatch', 'canvas.json');
    await expect.poll(() => existsSync(note)).toBe(true);
    expect(JSON.parse(readFileSync(note, 'utf8'))).toMatchObject({ canvas: briefCanvas, folder: brief });
    expect(readFileSync(join(brief, '.hatch', '.gitignore'), 'utf8')).toBe('canvas.json\n');

    // The question can be skipped, and the user then looks at a canvas of their own.
    await win.getByTestId('new-canvas').click();
    await win.getByTestId('attach-skip').click();
    await expect(win.getByTestId('attach-modal')).toBeHidden();
    await expect.poll(() => tabs(home).length).toBe(3);
    const userCanvas = tabs(home).at(-1)!;
    expect(userCanvas.folder).toBeUndefined();

    // An agent working inside the folder opens its page on the folder's canvas, not the one the user looks at.
    const builder = await connect(url, `agent=claude-code&folder=${encodeURIComponent(join(brief, 'docs'))}`);
    const opened = await builder('navigate', { to: 'hatch:brochure' });
    expect(opened.isError, opened.text).toBe(false);
    await expect.poll(() => tabs(home).find((t) => t.id === briefCanvas)!.hatches.length).toBe(1);
    expect(tabs(home).find((t) => t.id === userCanvas.id)!.hatches).toHaveLength(0);
    const status = await builder('status');
    expect(status.text).toContain(`belongs to the working folder ${brief}`);
    // Sessions in different folders send the same app name, so the folder tells them apart.
    expect(status.text).toContain('"claude-code.docs"');
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'work-folders.json'), 'utf8'))[0]).toBe(join(brief, 'docs'));

    // An agent in a folder with no canvas gets a fresh canvas attached to that folder, instead of the user's.
    const stray = await connect(url, `agent=claude-code&folder=${encodeURIComponent(loose)}`);
    expect((await stray('navigate', { to: 'hatch:brochure' })).isError).toBe(false);
    await expect.poll(() => tabs(home).some((t) => t.folder === loose && t.hatches.length === 1)).toBe(true);
    expect(tabs(home).find((t) => t.id === userCanvas.id)!.hatches).toHaveLength(0);

    // The Projects panel lists the working folders and detaches one, and the note goes with it.
    await win.getByTestId('left-library').click();
    await expect(win.getByTestId('working-folder-client-brief')).toBeVisible();
    await capture(app, 'test-results/screens/working-folders.png');
    await win.getByTestId('working-folder-client-brief').getByTestId('detach-folder').click();
    await expect.poll(() => tabs(home).some((t) => t.folder === brief)).toBe(false);
    await expect.poll(() => existsSync(note)).toBe(false);

    // The panel attaches the canvas the user is looking at, through the same question.
    await win.getByTestId('attach-current').click();
    await win.getByTestId('attach-to-client-brief').click();
    await expect.poll(() => tabs(home).find((t) => t.folder === brief)?.id).toBe(userCanvas.id);

    // use_project moves an agent with no folder to the folder's canvas, and a registered project's name stands for its folder.
    const visitor = await connect(url, 'agent=visitor');
    const moved = await visitor('use_project', { folder: brief });
    expect(moved.text).toContain(userCanvas.id);
    expect(moved.text).toContain(`the working folder ${brief}`);
    const byName = await visitor('use_project', { project: 'brochure' });
    expect(byName.text).toContain(`the working folder ${site}`);
    await expect.poll(() => tabs(home).some((t) => t.folder === site)).toBe(true);
  } finally {
    await app.close();
  }
});
