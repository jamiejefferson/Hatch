// A new user meets the guide once, and sends feedback from the strip. A stand-in service takes the place of the real one.
import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { capture, freshHome, launch } from './helpers';

interface Received { path: string; type: string; body: Buffer }

function serveFeedback(): Promise<{ url: string; received: Received[]; fail(on: boolean): void; close(): Promise<void> }> {
  const received: Received[] = [];
  let failing = false;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (failing) return void res.writeHead(503).end();
      received.push({ path: req.url ?? '', type: String(req.headers['content-type']), body: Buffer.concat(chunks) });
      res.writeHead(201).end();
    });
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      ok({ url: `http://127.0.0.1:${port}`, received, fail: (on) => (failing = on), close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

test('the guide runs once, points at the real controls and opens again from the Help menu', async () => {
  const home = freshHome();
  let { app, win } = await launch(home, 0, { HATCH_GUIDE: '1' });
  try {
    const guide = win.getByTestId('guide');
    await expect(guide).toBeVisible();
    await expect(guide.getByRole('heading')).toHaveText('Open a page in a Hatch');
    await capture(app, 'test-results/screens/18-guide.png');

    // The ring sits on the control the card describes.
    const ring = await win.locator('.guide-ring').boundingBox();
    const target = await win.getByTestId('new-hatch').boundingBox();
    expect(Math.abs(ring!.x + ring!.width / 2 - (target!.x + target!.width / 2))).toBeLessThan(2);

    const titles: string[] = [];
    for (let i = 0; i < 5; i++) {
      await win.getByTestId('guide-next').click();
      titles.push((await guide.getByRole('heading').textContent()) ?? '');
    }
    expect(titles).toEqual(['Move around the canvas', 'Pin a comment to an element', 'Run a local project', 'Hand Hatch to your agent', 'Tell us what you find']);
    await win.getByTestId('guide-next').click();
    await expect(guide).toHaveCount(0);
    await app.close();

    ({ app, win } = await launch(home, 0, { HATCH_GUIDE: '1' }));
    await win.waitForTimeout(500);
    await expect(win.getByTestId('guide')).toHaveCount(0);

    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.role === 'help')!.submenu!.items.find((i) => i.label === 'Show the Guide')!.click());
    await expect(win.getByTestId('guide')).toBeVisible();
    await win.keyboard.press('Escape');
    await expect(win.getByTestId('guide')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('feedback sends the message, the versions and a picture, and a failed send waits in the outbox', async () => {
  const service = await serveFeedback();
  const home = freshHome();
  let { app, win } = await launch(home, 0, { HATCH_FEEDBACK_URL: service.url });
  try {
    await win.getByTestId('panel-feedback').click();
    await expect(win.getByTestId('feedback-shot')).toBeVisible();
    await expect(win.getByTestId('feedback-details')).toContainText('macOS');
    await expect(win.getByTestId('feedback-send')).toBeDisabled();
    await win.getByTestId('feedback-kind-idea').click();
    await win.getByTestId('feedback-message').fill('Let a Hatch snap to another Hatch.');
    await win.waitForTimeout(200);
    await capture(app, 'test-results/screens/19-feedback.png');
    await win.getByTestId('feedback-send').click();
    await expect(win.getByTestId('feedback-outcome')).toContainText('arrived');

    expect(service.received).toHaveLength(2);
    const [upload, row] = service.received as [Received, Received];
    expect(upload.path).toMatch(/^\/storage\/v1\/object\/feedback-screenshots\/[0-9a-f-]{36}\.jpg$/);
    expect(upload.body.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(upload.body.length).toBeLessThan(3 * 1024 * 1024);
    expect(row.path).toBe('/rest/v1/feedback');
    const sent = JSON.parse(row.body.toString());
    expect(sent).toMatchObject({ kind: 'idea', message: 'Let a Hatch snap to another Hatch.', screenshot_path: upload.path.split('/').pop() });
    expect(sent.app_version).toMatch(/^\d+\.\d+\.\d+/);
    expect(sent.os_version).toContain('macOS');
    expect(Object.keys(sent).sort()).toEqual(['app_version', 'id', 'kind', 'message', 'os_version', 'screenshot_path']);

    // With the service down, the feedback stays on disk. Without the picture, no upload is tried.
    service.fail(true);
    await win.getByRole('button', { name: 'Write another' }).click();
    await win.getByTestId('feedback-attach').click();
    await win.getByTestId('feedback-message').fill('The service was down for this one.');
    await win.getByTestId('feedback-send').click();
    await expect(win.getByTestId('feedback-outcome')).toContainText('saved your feedback');
    expect(readdirSync(join(home, 'feedback-outbox')).filter((n) => n.endsWith('.json'))).toHaveLength(1);
    await app.close();

    // The next start sends it.
    service.fail(false);
    ({ app, win } = await launch(home, 0, { HATCH_FEEDBACK_URL: service.url }));
    await expect.poll(() => service.received.length, { timeout: 15_000 }).toBe(3);
    expect(JSON.parse(service.received[2]!.body.toString())).toMatchObject({ message: 'The service was down for this one.', screenshot_path: null });
    await expect.poll(() => existsSync(join(home, 'feedback-outbox')) ? readdirSync(join(home, 'feedback-outbox')).length : 0).toBe(0);
  } finally {
    await app.close();
    await service.close();
  }
});
