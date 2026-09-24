// Saved links file into folders: from the form, by moving a row, by renaming a folder, and from an agent.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

type Link = { name: string; url: string; folder?: string };

test('links group into folders in the panel and the file, and an agent reads and uses the folders', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app, win } = await launch(home, 0);
  const saved = (): Link[] => JSON.parse(readFileSync(join(home, 'links.json'), 'utf8')) as Link[];
  const folderOf = (name: string): string | undefined => saved().find((l) => l.name === name)?.folder;
  try {
    await win.getByTestId('panel-links').click();

    // A link added with a folder name lands under that folder. One added without sits at the top of the list.
    await win.getByTestId('link-address').fill(`${site.url}/index.html`);
    await win.getByTestId('link-name').fill('Pricing');
    await win.getByTestId('link-folder').fill('Work');
    await win.getByTestId('link-add').click();
    await win.getByTestId('link-address').fill(`${site.url}/docs.html`);
    await win.getByTestId('link-name').fill('Docs');
    await win.getByTestId('link-folder').fill('');
    await win.getByTestId('link-add').click();
    const work = win.getByTestId('link-folder-Work');
    await expect(work.getByRole('button', { name: /^Pricing / })).toBeVisible();
    await expect(win.getByTestId('link-list').getByRole('button', { name: /^Docs / })).toBeVisible();
    await expect.poll(() => folderOf('Pricing')).toBe('Work');
    expect(folderOf('Docs')).toBeUndefined();

    // The folder button on a row takes a folder name, and the row moves.
    await win.getByRole('button', { name: 'Move Docs to a folder' }).click();
    await win.getByTestId('link-move').fill('Work');
    await win.getByTestId('link-move').press('Enter');
    await expect(work.getByRole('button', { name: /^Docs / })).toBeVisible();
    await expect(win.getByTestId('link-list')).toHaveCount(0);
    await expect.poll(() => folderOf('Docs')).toBe('Work');

    // A folder closes and opens on its heading.
    await work.getByRole('button', { name: /^Work/ }).click();
    await expect(work.getByRole('button', { name: /^Docs / })).toHaveCount(0);
    await work.getByRole('button', { name: /^Work/ }).click();
    await expect(work.getByRole('button', { name: /^Docs / })).toBeVisible();

    // A double-click renames the folder for every link in it.
    await work.getByRole('button', { name: /^Work/ }).dblclick();
    await win.getByTestId('folder-rename').fill('Client');
    await win.getByTestId('folder-rename').press('Enter');
    await expect(win.getByTestId('link-folder-Client').getByRole('button', { name: /^Docs / })).toBeVisible();
    await expect.poll(() => saved().map((l) => l.folder)).toEqual(['Client', 'Client']);

    // An agent sees the folders and files a link under a new one.
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const agent = new Client({ name: 'filer', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=filer`)));
    const call = async (name: string, args: Record<string, unknown> = {}): Promise<string> => ((await agent.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text;
    const listed = await call('list_links');
    expect(listed).toContain('Folder "Client":');
    expect(listed).toContain('  "Docs"');
    expect(await call('save_link', { title: 'Shadow', url: `${site.url}/shadow.html`, folder: 'Reading' })).toContain('in the folder "Reading"');
    await agent.close();
    await expect(win.getByTestId('link-folder-Reading').getByRole('button', { name: /^Shadow / })).toBeVisible();
    expect(folderOf('Shadow')).toBe('Reading');
  } finally {
    await app.close();
    await site.close();
  }
});
