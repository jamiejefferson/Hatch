// Taking things out of a page: an element as self-contained markup, an element's styles as CSS, and an image as a file.
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';
import { HatchError, type PageSession } from '../../cdp/session';
import { askGuest } from '../../hatches/registry';
import { copyForPaper } from '../../paper';
import { hatchHome } from '../../paths';
import { settingsStore } from '../../store/stores';
import { onPage } from './page';
import { hatch, intent, ref, tool } from './types';

/** Marks the element behind a reference, so the script Hatch runs inside the page can find it. */
async function mark(page: PageSession, reference: string): Promise<string> {
  const backendNodeId = page.refs.nodeFor(reference);
  if (backendNodeId === undefined) throw new HatchError(`No element has the reference ${reference} on this page. References clear when the page navigates. Call snapshot and use a reference from the new outline.`);
  const token = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { object } = await page.send<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId });
  await page.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function () { (this.nodeType === 1 ? this : this.parentElement).setAttribute('data-hatch-mark', ${JSON.stringify(token)}); }` });
  return token;
}

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
async function save(folder: string, name: string, data: string | Buffer): Promise<string> {
  const dir = join(hatchHome(), folder);
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, data);
  return file;
}

/** Markup longer than this goes to the file alone, so one reply never floods an agent's context. */
const INLINE_LIMIT = 60_000;

export const extractTools = [
  tool({
    name: 'grab_element',
    description:
      'Returns one element as self-contained HTML: every element carries its computed styles inline and images travel inside the markup. It is the same output as the "Grab an element" button, in the shape the Paper design tool takes, so pass it to a design tool to rebuild the element exactly, nesting, gradients and images included. Hatch also saves the markup to a file and puts it on the clipboard for Paper. It reads the page as deeply as running script does, so the same setting switches it on.',
    shape: { ref, clipboard: z.boolean().default(true).describe('Also put the markup on the clipboard in Paper\'s format, so the user can press Cmd+V in Paper.'), hatch, intent },
    readOnly: true,
    summary: (a) => `grab_element ${a.ref}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        if (!(await settingsStore.read()).allowEvaluate) throw new HatchError('grab_element is switched off, because it reads the page as deeply as running script does. The user can switch it on in Hatch under Settings, "Let agents run script in pages". get_element and get_css measure an element without it.');
        const answer = await askGuest<{ html?: string; elements?: number; label?: string; error?: string }>(page.guest, 'grab-marked', await mark(page, a.ref), 30_000);
        if (!answer) throw new HatchError('The page did not answer in 30 seconds. A very large element takes long to copy, so try a smaller one.');
        if (!answer.html) throw new HatchError(answer.error ?? 'Hatch could not copy that element.');
        const file = await save('grabs', `${stamp()}-${a.ref}.html`, answer.html);
        if (a.clipboard) await copyForPaper(answer.html);
        const head = `Grabbed ${JSON.stringify(answer.label ?? a.ref)}: ${answer.elements} ${answer.elements === 1 ? 'element' : 'elements'}, ${answer.html.length} characters. Saved to ${file}.${a.clipboard ? ' The markup is also on the clipboard in Paper\'s format.' : ''}`;
        return answer.html.length > INLINE_LIMIT ? `${head}\nThe markup is longer than ${INLINE_LIMIT} characters, so read it from the file.` : `${head}\n\n${answer.html}`;
      }),
  }),
  tool({
    name: 'get_css',
    description: 'Returns one element\'s own styles as a CSS rule you can paste into code: every computed value that differs from a bare element of the same tag. get_element gives the same element as a measured summary.',
    shape: { ref, hatch, intent },
    readOnly: true,
    summary: (a) => `get_css ${a.ref}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const answer = await askGuest<{ css?: string; error?: string }>(page.guest, 'css-marked', await mark(page, a.ref), 10_000);
        if (!answer?.css) throw new HatchError(answer?.error ?? 'The page did not answer. Call snapshot and try again.');
        return answer.css;
      }),
  }),
  tool({
    name: 'save_image',
    description: 'Saves an image from the page to a file and returns its path. It takes an <img>, <picture>, <svg> or <video> poster by reference, or an element with a CSS background image.',
    shape: { ref, hatch, intent },
    readOnly: true,
    summary: (a) => `save_image ${a.ref}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const backendNodeId = page.refs.nodeFor(a.ref);
        if (backendNodeId === undefined) throw new HatchError(`No element has the reference ${a.ref} on this page. Call snapshot and use a reference from the new outline.`);
        const { object } = await page.send<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId });
        const found = await page.send<{ result: { value: { url?: string; svg?: string } } }>('Runtime.callFunctionOn', {
          objectId: object.objectId,
          returnByValue: true,
          functionDeclaration: `function () {
            const el = this.nodeType === 1 ? this : this.parentElement;
            const svg = el.closest('svg');
            if (svg) return { svg: new XMLSerializer().serializeToString(svg) };
            const img = el.matches('img, video') ? el : el.querySelector('img');
            const direct = img && (img.currentSrc || img.src || img.poster);
            if (direct) return { url: new URL(direct, document.baseURI).href };
            const bg = getComputedStyle(el).backgroundImage.match(/url\\("?([^")]+)"?\\)/);
            return bg ? { url: new URL(bg[1], document.baseURI).href } : {};
          }`,
        });
        const { url, svg } = found.result.value;
        if (svg) return `Saved the SVG to ${await save('assets', `${stamp()}-${a.ref}.svg`, svg)}.`;
        if (!url) throw new HatchError(`The element ${a.ref} holds no image, and it has no CSS background image. find "image" lists the images in the agent view.`);
        if (url.startsWith('data:')) {
          const match = url.match(/^data:image\/([a-z0-9+.-]+);base64,(.*)$/i);
          if (!match) throw new HatchError('That image is an inline data link in a form Hatch cannot save.');
          return `Saved the image to ${await save('assets', `${stamp()}-${a.ref}.${match[1]!.replace('svg+xml', 'svg').replace('jpeg', 'jpg')}`, Buffer.from(match[2]!, 'base64'))}.`;
        }
        // The page's own session fetches the file, so an image behind a sign-in still downloads.
        const response = await page.guest.session.fetch(url);
        if (!response.ok) throw new HatchError(`The image at ${url} answered ${response.status}.`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
        const ext = extname(new URL(url).pathname).slice(0, 6) || { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'image/avif': '.avif' }[type] || '.img';
        return `Saved the image to ${await save('assets', `${stamp()}-${a.ref}${ext}`, bytes)} (${bytes.length} bytes, ${type || 'unknown type'}, from ${url}).`;
      }),
  }),
];
