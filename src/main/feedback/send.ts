import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, net, type WebContents } from 'electron';
import { FEEDBACK_KINDS, type FeedbackDetails, type FeedbackInput, type FeedbackKind } from '@shared/feedback';
import { dataFile } from '../paths';
import { FEEDBACK_KEY, feedbackUrl, SCREENSHOT_BUCKET } from './config';

const SHOT_WIDTH = 1600;

interface Queued {
  id: string;
  kind: FeedbackKind;
  message: string;
  app_version: string;
  os_version: string;
  screenshot: boolean;
}

/** The capture the user sees in the form. The main process keeps the bytes, so the interface never sends an image back. */
let shot: Buffer | null = null;

const outbox = (): string => dataFile('feedback-outbox');

export const feedbackDetails = (): FeedbackDetails => ({ appVersion: app.getVersion(), osVersion: `macOS ${process.getSystemVersion()}, ${process.arch}` });

/**
 * Captures Hatch's window as a JPEG. The interface calls this before it shows the form, so the image holds what the user was looking at.
 * capturePage is the one safe way to do it: a device metrics override would resize every live page.
 */
export async function captureForFeedback(host: WebContents): Promise<string | null> {
  try {
    const image = await host.capturePage();
    const { width } = image.getSize();
    if (width < 1) throw new Error('The capture was empty.');
    shot = (width > SHOT_WIDTH ? image.resize({ width: SHOT_WIDTH, quality: 'good' }) : image).toJPEG(80);
    return `data:image/jpeg;base64,${shot.toString('base64')}`;
  } catch {
    shot = null;
    return null;
  }
}

async function post(path: string, type: string, body: string | Buffer): Promise<void> {
  const response = await net.fetch(`${feedbackUrl()}${path}`, {
    method: 'POST',
    headers: { apikey: FEEDBACK_KEY, authorization: `Bearer ${FEEDBACK_KEY}`, 'content-type': type, prefer: 'return=minimal' },
    body: typeof body === 'string' ? body : new Uint8Array(body),
  });
  // 409 means an earlier try already delivered this part.
  if (response.ok || response.status === 409) return;
  const text = await response.text().catch(() => '');
  if (/"(Duplicate|23505)"/.test(text)) return;
  throw Object.assign(new Error(`The feedback service answered ${response.status}.`), { refused: response.status >= 400 && response.status < 500 && response.status !== 429 });
}

async function deliver(item: Queued, image: Buffer | null): Promise<void> {
  if (image) await post(`/storage/v1/object/${SCREENSHOT_BUCKET}/${item.id}.jpg`, 'image/jpeg', image);
  const { screenshot: _flag, ...row } = item;
  await post('/rest/v1/feedback', 'application/json', JSON.stringify({ ...row, screenshot_path: image ? `${item.id}.jpg` : null }));
}

/** Sends one piece of feedback. A send that fails stays in the outbox, and Hatch tries it again the next time it opens. */
export async function sendFeedback(input: FeedbackInput): Promise<'sent' | 'saved'> {
  const message = String(input.message ?? '').trim().slice(0, 5000);
  if (!message) throw new Error('Write a few words before you send.');
  const kind = FEEDBACK_KINDS.includes(input.kind) ? input.kind : 'other';
  const details = feedbackDetails();
  const image = input.screenshot ? shot : null;
  const item: Queued = { id: randomUUID(), kind, message, app_version: details.appVersion, os_version: details.osVersion, screenshot: image !== null };
  try {
    await deliver(item, image);
    void flushOutbox();
    return 'sent';
  } catch {
    await mkdir(outbox(), { recursive: true });
    if (image) await writeFile(join(outbox(), `${item.id}.jpg`), image);
    await writeFile(join(outbox(), `${item.id}.json`), JSON.stringify(item, null, 2));
    return 'saved';
  }
}

/** Tries every saved piece of feedback once. The first failure ends the run, because the service is most likely out of reach. */
export async function flushOutbox(): Promise<void> {
  const names = await readdir(outbox()).catch(() => [] as string[]);
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const file = join(outbox(), name);
    try {
      const item = JSON.parse(await readFile(file, 'utf8')) as Queued;
      const imageFile = join(outbox(), `${item.id}.jpg`);
      await deliver(item, item.screenshot ? await readFile(imageFile) : null);
      await rm(file, { force: true });
      await rm(imageFile, { force: true });
    } catch (error) {
      // The service refused this one for good, so it leaves the outbox and the rest still go.
      if (!(error as { refused?: boolean }).refused) return;
      await rm(file, { force: true });
      await rm(join(outbox(), name.replace(/\.json$/, '.jpg')), { force: true });
    }
  }
}
