import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataFile } from '../paths';
import { ensureNoDialog } from './actions';
import { HatchError, type PageSession } from './session';

export interface Shot { base64: string; path: string; width: number; height: number }

interface Metrics { cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number }; cssContentSize: { width: number; height: number } }

/**
 * Captures the page through CDP on the guest, which returns the full surface at any canvas zoom and with the window hidden.
 * Comment pins live in Hatch's own interface layer, so they never appear here.
 */
export async function screenshot(page: PageSession, options: { ref?: string; fullPage?: boolean; maxWidth?: number }): Promise<Shot> {
  ensureNoDialog(page);
  const metrics = await page.send<Metrics>('Page.getLayoutMetrics');
  const view = metrics.cssVisualViewport;
  let clip = { x: view.pageX, y: view.pageY, width: view.clientWidth, height: view.clientHeight };

  if (options.ref) {
    const backendNodeId = page.refs.nodeFor(options.ref);
    if (backendNodeId === undefined) throw new HatchError(`No element has the reference ${options.ref} on this page. Call snapshot and use a reference from the new outline.`);
    await page.send('DOM.scrollIntoViewIfNeeded', { backendNodeId }).catch(() => {});
    const { model } = await page.send<{ model: { border: number[] } }>('DOM.getBoxModel', { backendNodeId }).catch(() => {
      throw new HatchError(`The element ${options.ref} has no box on the page. It may be hidden.`);
    });
    const after = (await page.send<Metrics>('Page.getLayoutMetrics')).cssVisualViewport;
    const xs = [model.border[0]!, model.border[2]!, model.border[4]!, model.border[6]!];
    const ys = [model.border[1]!, model.border[3]!, model.border[5]!, model.border[7]!];
    // getBoxModel answers in viewport coordinates and the clip takes document coordinates.
    clip = { x: Math.min(...xs) + after.pageX, y: Math.min(...ys) + after.pageY, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  } else if (options.fullPage) {
    clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: Math.min(metrics.cssContentSize.height, 16000) };
  }
  if (clip.width < 1 || clip.height < 1) throw new HatchError('That target has no visible area to capture.');

  const dpr = await page.evaluate<number>('devicePixelRatio');
  const maxWidth = options.maxWidth ?? 1280;
  const scale = Math.min(1, maxWidth / (clip.width * dpr));
  const { data } = await page.send<{ data: string }>('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale }, captureBeyondViewport: !!options.fullPage || !!options.ref }, 20000);
  if (!data) throw new HatchError('The page returned an empty image. Try again in a moment.');

  const bytes = Buffer.from(data, 'base64');
  const dir = dataFile('screenshots');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  await writeFile(path, bytes);
  return { base64: data, path, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
