// Chromium draws only the part of a page inside the window, at its size on screen. A screenshot of a Hatch off the canvas failed,
// one on a zoomed-out canvas came back blurred, and one running past the window came back mostly blank.
// Every capture here must match one of the page sitting whole in the window at 100%, and the page must go back where it was.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { freshHome, launch, serveSite } from './helpers';

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

let site: Awaited<ReturnType<typeof serveSite>>;
let app: ElectronApplication;
let win: Page;
let agent: Client;

test.beforeAll(async () => {
  site = await serveSite();
  const home = freshHome();
  ({ app, win } = await launch(home, await freePort()));
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  agent = new Client({ name: 'shooter', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=shooter`)));
});
test.afterAll(async () => {
  await agent?.close();
  await app?.close();
  await site?.close();
});

/** The screenshot as PNG data, at the page's own width so detail survives. */
async function shoot(): Promise<string> {
  const r = (await agent.callTool({ name: 'screenshot', arguments: { max_width: 960 } })) as { content: { type: string; data?: string; text?: string }[]; isError?: boolean };
  const image = r.content.find((c) => c.type === 'image');
  if (r.isError || !image) throw new Error(r.content.map((c) => c.text).join(' '));
  return image.data!;
}

/** The mean difference of two images per colour channel, from 0 to 255. */
function difference(a: string, b: string): Promise<number> {
  return app.evaluate(({ nativeImage }, [x, y]) => {
    const one = nativeImage.createFromBuffer(Buffer.from(x!, 'base64'));
    const two = nativeImage.createFromBuffer(Buffer.from(y!, 'base64'));
    const size = one.getSize();
    const other = two.getSize().width === size.width ? two : two.resize(size);
    const p = one.toBitmap();
    const q = other.toBitmap();
    let sum = 0;
    for (let i = 0; i < p.length; i++) sum += Math.abs(p[i]! - q[i]!);
    return sum / p.length;
  }, [a, b]);
}

async function drag(from: number, to: number): Promise<void> {
  const box = (await win.getByTestId('canvas').boundingBox())!;
  const y = box.y + box.height - 20;
  await win.mouse.move(box.x + from * box.width, y);
  await win.mouse.down();
  await win.mouse.move(box.x + to * box.width, y, { steps: 8 });
  await win.mouse.up();
}

const pageStyle = (): Promise<string> => win.evaluate<string>("document.querySelector('webview.hatch-page').style.cssText");

test('a screenshot shows the whole page wherever the Hatch sits on the canvas', async () => {
  await agent.callTool({ name: 'navigate', arguments: { to: `${site.url}/index.html` } });
  const before = await pageStyle();

  // A page small enough to sit whole in the window at 100%, shown that way, makes the reference.
  await agent.callTool({ name: 'set_viewport', arguments: { width: 480, height: 360 } });
  await win.getByTestId('show-all').click();
  await expect(win.getByTestId('zoom-level')).toHaveText('100%');
  const reference = await shoot();

  // A zoomed-out canvas.
  for (let i = 0; i < 4; i++) await win.getByLabel('Zoom out').click();
  expect(await difference(reference, await shoot())).toBeLessThan(2);

  // Off the canvas altogether.
  for (let i = 0; i < 4; i++) await drag(0.95, 0.05);
  expect(await difference(reference, await shoot())).toBeLessThan(2);
  for (let i = 0; i < 4; i++) await drag(0.05, 0.95);

  // Zoomed in until the page runs past the window.
  for (let i = 0; i < 10; i++) await win.getByLabel('Zoom in').click();
  expect(await difference(reference, await shoot())).toBeLessThan(2);

  // The page goes back where it was, with nothing left of the stage.
  await expect.poll(pageStyle).not.toContain('transform');
  expect((await pageStyle()).includes('opacity: 0')).toBe(before.includes('opacity: 0'));
});

test('a window that has stopped drawing still yields the visible part', async () => {
  // A capture that times out stands in for a window on another Space, which never sends the fresh frame CDP waits for.
  const home = freshHome();
  const slow = await launch(home, await freePort(), { HATCH_CAPTURE_TIMEOUT_MS: '1' });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const other = new Client({ name: 'patient', version: '1.0.0' });
  await other.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=patient`)));
  try {
    await other.callTool({ name: 'navigate', arguments: { to: `${site.url}/index.html` } });
    const call = async (args: Record<string, unknown>): Promise<{ text: string; image: boolean; isError: boolean }> => {
      const r = (await other.callTool({ name: 'screenshot', arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean };
      return { text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join(' '), image: r.content.some((c) => c.type === 'image'), isError: !!r.isError };
    };
    const view = await call({ max_width: 480 });
    expect(view.isError).toBe(false);
    expect(view.image).toBe(true);
    expect(view.text).toMatch(/^480 × \d+ pixels/);
    const whole = await call({ full_page: true, max_width: 480 });
    expect(whole.image).toBe(true);
    expect(whole.text).toContain('the visible part of the page alone');
  } finally {
    await other.close();
    await slow.app.close();
  }
});
