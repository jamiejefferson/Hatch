import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NativeImage } from 'electron';
import { dataFile } from '../paths';
import { callInterface } from '../renderer-rpc';
import { ensureNoDialog } from './actions';
import { HatchError, type PageSession } from './session';

export interface Shot {
  base64: string;
  path: string;
  width: number;
  height: number;
  /** Says what the image leaves out, when it falls short of what the agent asked for. */
  note?: string;
}

interface Metrics { cssVisualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number }; cssContentSize: { width: number; height: number } }
interface Clip { x: number; y: number; width: number; height: number }

/**
 * CDP waits for a fresh frame. A window that has stopped drawing never sends one, so a capture of the visible part gives up early and copies the page's last frame.
 * `HATCH_CAPTURE_TIMEOUT_MS` shortens both waits for the tests, which cannot stop a window drawing.
 */
const testTimeout = Number(process.env.HATCH_CAPTURE_TIMEOUT_MS) || 0;
const VIEW_TIMEOUT_MS = testTimeout || 8000;
const BEYOND_TIMEOUT_MS = testTimeout || 20000;
/** Long enough for a staged page to draw again at its new size. */
const STAGE_SETTLE_MS = 150;

const NOT_DRAWING = "Hatch's window was not drawing, which happens while it sits on another Space or behind another app";

/**
 * Captures the page through CDP on the guest. Comment pins live in Hatch's own interface layer, so they never appear here.
 * Chromium draws only what sits inside the window, at the size it shows there, so a page that runs past the window or sits on a zoomed-out canvas
 * moves into view at full size, unseen, for the moment of the capture.
 */
export async function screenshot(page: PageSession, options: { ref?: string; fullPage?: boolean; maxWidth?: number }): Promise<Shot> {
  ensureNoDialog(page);
  const staged = await callInterface<boolean>('stageHatch', { hatchId: page.hatchId, on: true }).catch(() => false);
  try {
    if (staged) await settle(page);
    return await capture(page, options);
  } finally {
    if (staged) void callInterface('stageHatch', { hatchId: page.hatchId, on: false }).catch(() => {});
  }
}

/** Waits for the page to draw twice, then a moment more for the new size to reach the screen. */
async function settle(page: PageSession): Promise<void> {
  await page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))', 1000).catch(() => {});
  await new Promise((r) => setTimeout(r, STAGE_SETTLE_MS));
}

async function capture(page: PageSession, options: { ref?: string; fullPage?: boolean; maxWidth?: number }): Promise<Shot> {
  const metrics = await page.send<Metrics>('Page.getLayoutMetrics');
  const view = metrics.cssVisualViewport;
  let clip: Clip = { x: view.pageX, y: view.pageY, width: view.clientWidth, height: view.clientHeight };
  // The part of the viewport the clip covers, in viewport coordinates. Null when the clip reaches beyond the viewport.
  let inView: Clip | null = { x: 0, y: 0, width: view.clientWidth, height: view.clientHeight };

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
    const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    // getBoxModel answers in viewport coordinates and the clip takes document coordinates.
    clip = { ...box, x: box.x + after.pageX, y: box.y + after.pageY };
    const fits = box.x >= 0 && box.y >= 0 && box.x + box.width <= after.clientWidth && box.y + box.height <= after.clientHeight;
    inView = fits ? box : null;
  } else if (options.fullPage) {
    clip = { x: 0, y: 0, width: metrics.cssContentSize.width, height: Math.min(metrics.cssContentSize.height, 16000) };
    if (clip.height > view.clientHeight + 1 || clip.width > view.clientWidth + 1) inView = null;
  }
  if (clip.width < 1 || clip.height < 1) throw new HatchError('That target has no visible area to capture.');

  const maxWidth = options.maxWidth ?? 1280;
  const dpr = await page.evaluate<number>('devicePixelRatio');
  const scale = Math.min(1, maxWidth / (clip.width * dpr));
  const beyond = !!options.fullPage || !!options.ref;
  try {
    const { data } = await page.send<{ data: string }>('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale }, captureBeyondViewport: beyond }, inView ? VIEW_TIMEOUT_MS : BEYOND_TIMEOUT_MS);
    if (!data) throw new HatchError('The page returned an empty image. Try again in a moment.');
    return await save(Buffer.from(data, 'base64'));
  } catch (err) {
    // The page's last frame still holds the visible part, whether or not the window draws.
    const fallback = inView ?? { x: 0, y: 0, width: view.clientWidth, height: view.clientHeight };
    const image = await lastFrame(page, fallback);
    if (!image) throw err;
    const shot = await save(fitWidth(image, maxWidth).toPNG());
    if (inView) return shot;
    return { ...shot, note: `${NOT_DRAWING}, so this image holds the visible part of the page alone. Try again once Hatch is on screen for ${options.ref ? 'the whole element' : 'the whole page'}.` };
  }
}

/** The page's last frame within one part of its viewport, or null when Chromium holds none. */
async function lastFrame(page: PageSession, rect: Clip): Promise<NativeImage | null> {
  try {
    const image = await page.guest.capturePage({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
    return image.isEmpty() ? null : image;
  } catch {
    return null;
  }
}

function fitWidth(image: NativeImage, maxWidth: number): NativeImage {
  const { width } = image.getSize();
  return width > maxWidth ? image.resize({ width: maxWidth, quality: 'best' }) : image;
}

async function save(bytes: Buffer): Promise<Shot> {
  const dir = dataFile('screenshots');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
  await writeFile(path, bytes);
  return { base64: bytes.toString('base64'), path, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
