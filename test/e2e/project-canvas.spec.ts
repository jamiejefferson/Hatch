// A canvas may belong to a project, so an agent working in that project's folder uses the project's canvas and leaves the
// user's other canvases alone. A new canvas asks which project it belongs to, the Projects panel attaches and detaches,
// Hatch writes .hatch/canvas.json in the project, and an agent finds its canvas by folder (the user, 5 Oct 2026).
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

test('a new canvas attaches to a project, an agent in its folder works there, and the Projects panel detaches it', async () => {
  const work = mkdtempSync(join(tmpdir(), 'hatch-projects-'));
  const site = join(work, 'brochure');
  mkdirSync(join(site, 'src'), { recursive: true });
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>Brochure</title><h1>Brochure home</h1>');
  const loose = join(work, 'scratch');
  mkdirSync(loose);
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  try {
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const setup = await connect(url, 'agent=setup');
    expect((await setup('register_project', { folder: site })).text).toContain('hatch:brochure');

    // A new canvas asks which project it belongs to, and attaching names the canvas after the project.
    await win.getByTestId('left-canvases').click();
    await win.getByTestId('new-canvas').click();
    await expect(win.getByTestId('attach-modal')).toBeVisible();
    await capture(app, 'test-results/screens/attach-canvas.png');
    await win.getByTestId('attach-to-brochure').click();
    await expect(win.getByTestId('attach-modal')).toBeHidden();
    await expect(canvasRow(win, 'brochure').getByTestId('canvas-project')).toBeVisible();
    await expect.poll(() => tabs(home).find((t) => t.project === 'brochure')?.id ?? '').not.toBe('');
    const projectCanvas = tabs(home).find((t) => t.project === 'brochure')!.id;

    // Hatch tells an agent in the folder which canvas is its own, and keeps the note out of the project's history.
    const note = join(site, '.hatch', 'canvas.json');
    await expect.poll(() => existsSync(note)).toBe(true);
    expect(JSON.parse(readFileSync(note, 'utf8'))).toMatchObject({ canvas: projectCanvas, project: 'brochure' });
    expect(readFileSync(join(site, '.hatch', '.gitignore'), 'utf8')).toBe('canvas.json\n');

    // The question can be skipped, and the user then looks at a canvas of their own.
    await win.getByTestId('new-canvas').click();
    await win.getByTestId('attach-skip').click();
    await expect(win.getByTestId('attach-modal')).toBeHidden();
    await expect.poll(() => tabs(home).length).toBe(3);
    const userCanvas = tabs(home).at(-1)!;
    expect(userCanvas.project).toBeUndefined();

    // An agent working inside the project's folder opens its page on the project's canvas, not the one the user looks at.
    const builder = await connect(url, `agent=claude-code&folder=${encodeURIComponent(join(site, 'src'))}`);
    const opened = await builder('navigate', { to: 'hatch:brochure' });
    expect(opened.isError, opened.text).toBe(false);
    await expect.poll(() => tabs(home).find((t) => t.id === projectCanvas)!.hatches.length).toBe(1);
    expect(tabs(home).find((t) => t.id === userCanvas.id)!.hatches).toHaveLength(0);
    const status = await builder('status');
    expect(status.text).toContain('belongs to the project brochure');
    // Sessions in different folders send the same app name, so the folder tells them apart.
    expect(status.text).toContain('"claude-code.src"');

    // An agent in a folder that belongs to no project gets a fresh canvas instead of the user's.
    const stray = await connect(url, `agent=claude-code&folder=${encodeURIComponent(loose)}`);
    expect((await stray('navigate', { to: 'hatch:brochure' })).isError).toBe(false);
    await expect.poll(() => tabs(home).some((t) => t.name === 'scratch' && t.hatches.length === 1)).toBe(true);
    expect(tabs(home).find((t) => t.id === userCanvas.id)!.hatches).toHaveLength(0);

    // The Projects panel shows the canvas and detaches it, and the note goes with it.
    await win.getByTestId('left-library').click();
    await win.getByTitle("Show brochure's settings").click();
    await expect(win.getByTestId('project-canvas')).toContainText('belongs to the project');
    await capture(app, 'test-results/screens/project-canvas.png');
    await win.getByTestId('detach-canvas').click();
    await expect.poll(() => tabs(home).some((t) => t.project === 'brochure')).toBe(false);
    await expect.poll(() => existsSync(note)).toBe(false);

    // The panel attaches the canvas the user is looking at.
    await win.getByTestId('attach-current').click();
    await expect.poll(() => tabs(home).find((t) => t.project === 'brochure')?.id).toBe(userCanvas.id);

    // use_project by name moves an agent with no folder to the project's canvas.
    const visitor = await connect(url, 'agent=visitor');
    const moved = await visitor('use_project', { project: 'brochure' });
    expect(moved.text).toContain(userCanvas.id);
    expect(moved.text).toContain('the canvas of the project brochure');
  } finally {
    await app.close();
  }
});
