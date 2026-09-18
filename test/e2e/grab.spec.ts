// Grab for Paper: the user picks an element, and the clipboard then holds self-contained markup in the form Paper reads.
// Pasting into Paper stays a manual check. This test proves the markup redraws the element at the same size with no stylesheet.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { capture, freshHome, inPages, launch, openHatch, serveSite } from './helpers';

test('a grabbed element lands on the clipboard as x-paper-html and redraws faithfully on its own', async () => {
  const site = await serveSite();
  const { app, win } = await launch(freshHome(), 0);
  try {
    await openHatch(win, `${site.url}/index.html`);
    await expect.poll(async () => (await inPages<number>(app, `document.querySelectorAll('.plan').length`))[0]).toBe(3);
    const [plan] = await inPages<{ x: number; y: number; w: number; h: number }>(app, `(() => { const r = document.querySelectorAll('.plan')[1].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);

    await win.getByTestId('grab-element').click();
    const frame = (await win.locator('webview').boundingBox())!;
    const zoom = frame.width / 960;
    // Near the card's top left corner, inside its padding, so the pick lands on the card and on no child.
    await win.locator('.pick-shield').click({ position: { x: (plan!.x + 4) * zoom, y: (plan!.y + 4) * zoom } });
    await expect(win.getByTestId('grab-result')).toContainText('Paste it into Paper');

    // macOS puts a charset tag in front of any HTML on the clipboard, as it does for Paper's own extension in Chrome.
    const html = (
      await app.evaluate(async ({ clipboard }) => {
        const [item] = await clipboard.read();
        return ((await item!.getType('text/html')) as Blob).text();
      })
    ).replace(/^<meta charset='utf-8'>/, '');
    expect(html.startsWith('<x-paper-html><div style="')).toBe(true);
    expect(html.endsWith('</x-paper-html>')).toBe(true);
    expect(html).toContain('Team');
    expect(html).toContain('£12 per seat');
    expect(html).toContain('font-size:');
    expect(html).not.toContain('class=');
    expect(html).not.toContain('<script');

    // The markup goes into a bare page with no stylesheet, in a second Hatch. The card must come out the same size.
    const dir = join(freshHome(), 'pasted');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Pasted</title><body style="margin:24px">${html.replace(/^<x-paper-html>|<\/x-paper-html>$/g, '')}`);
    await openHatch(win, join(dir, 'index.html'));
    await expect.poll(async () => (await inPages<string>(app, 'document.title'))).toContain('Pasted');
    const sizes = await inPages<{ w: number; h: number } | null>(app, `(() => { if (document.title !== 'Pasted') return null; const r = document.body.firstElementChild.getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
    const pasted = sizes.find(Boolean)!;
    expect(Math.abs(pasted.w - plan!.w)).toBeLessThan(1);
    expect(Math.abs(pasted.h - plan!.h)).toBeLessThan(1);
    await capture(app, 'test-results/screens/15-grab-for-paper.png');
  } finally {
    await app.close();
    await site.close();
  }
});
