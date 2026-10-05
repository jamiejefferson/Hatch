// Google refuses a sign-in from an embedded Chromium, so Hatch shows itself as Firefox on Google's sign-in pages and as Chrome elsewhere.
// The tests cannot reach Google, so `HATCH_FIREFOX_HOSTS` makes localhost stand in for accounts.google.com, and 127.0.0.1 stays an ordinary site.
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch } from './helpers';

type Seen = { ua: string; uad: string; chrome: string };
const READ = `({ ua: navigator.userAgent, uad: typeof navigator.userAgentData, chrome: typeof window.chrome })`;

test('a sign-in page sees Firefox, native dialogs and no debugger, a pop-up too, and every other page sees Chrome', async () => {
  const requests: { host: string; path: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((req, res) => {
    requests.push({ host: req.headers.host ?? '', path: req.url ?? '', headers: req.headers });
    res.setHeader('content-type', 'text/html');
    // Asking for the client hints makes Chromium send the full set on the next request, which is the case the stripping must cover.
    res.setHeader('accept-ch', 'Sec-CH-UA-Full-Version-List, Sec-CH-UA-Platform-Version');
    res.end(`<!doctype html><title>${req.url}</title><h1>Sign in</h1><button onclick="window.open('/popup', 'p', 'width=480,height=600')">Pop</button><img src="/pixel.png">`);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  const home = freshHome();
  const { app, win } = await launch(home, 0, { HATCH_FIREFOX_HOSTS: 'localhost' });
  const attached = (): Promise<boolean> => app.evaluate(({ webContents }) => webContents.getAllWebContents().find((wc) => wc.getType() === 'webview')?.debugger.isAttached() ?? false);
  const dialogs = async (): Promise<{ native: boolean; bridge: string }> => (await inPages<{ native: boolean; bridge: string }>(app, `({ native: String(window.alert).includes('native'), bridge: typeof window.__hatchDialog })`))[0]!;
  try {
    // An ordinary site keeps the Chrome identity.
    await openHatch(win, `http://127.0.0.1:${port}/ordinary`);
    await expect.poll(async () => (await inPages<Seen>(app, READ))[0]?.ua ?? '').toMatch(/Chrome\/\d+/);
    expect((await inPages<Seen>(app, READ))[0]).toMatchObject({ uad: 'object', chrome: 'object' });
    await expect.poll(attached).toBe(true);
    expect(await dialogs()).toEqual({ native: false, bridge: 'function' });

    // The sign-in page sees Firefox, with no Chromium-only objects, and so do its requests, the image included.
    await inPages(app, `location.href = 'http://localhost:${port}/signin'`);
    await expect.poll(async () => (await inPages<Seen>(app, READ))[0]).toEqual({ ua: expect.stringMatching(/Firefox\/\d+/), uad: 'undefined', chrome: 'undefined' });
    await expect.poll(() => requests.filter((r) => r.host.startsWith('localhost')).map((r) => r.path)).toEqual(expect.arrayContaining(['/signin', '/pixel.png']));
    for (const r of requests.filter((x) => x.host.startsWith('localhost'))) {
      expect(r.headers['user-agent']).toMatch(/Firefox\/\d+/);
      expect(Object.keys(r.headers).filter((k) => k.startsWith('sec-ch-ua'))).toEqual([]);
    }
    expect(requests.find((r) => r.path === '/ordinary')?.headers['user-agent']).toMatch(/Chrome\/\d+/);

    // Google refuses a page with a debugger attached or dialogs that are not the browser's own, so Hatch lets go of the page
    // and an agent hears why it cannot act there.
    expect(await attached()).toBe(false);
    expect(await dialogs()).toEqual({ native: true, bridge: 'undefined' });
    const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
    const agent = new Client({ name: 'scout', version: '1.0.0' });
    await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=scout`)));
    const refused = (await agent.callTool({ name: 'snapshot', arguments: {} })) as { content: { text?: string }[]; isError?: boolean };
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain("Google's sign-in page");
    await agent.close();

    // The pop-up a sign-in opens, which Google's "Sign in with Google" uses, shows Firefox as well.
    await win.getByRole('button', { name: 'Fit to view' }).first().click();
    await expect.poll(() => inPages<boolean>(app, `!!window.open('/popup', 'p', 'width=480,height=600')`).then((r) => r[0])).toBe(true);
    const popupSeen = (): Promise<Seen | null> =>
      app.evaluate(async ({ BrowserWindow }, js) => {
        const wc = BrowserWindow.getAllWindows().map((w) => w.webContents).find((c) => c.getURL().endsWith('/popup'));
        return wc ? ((await wc.executeJavaScript(js, true)) as Seen) : null;
      }, READ);
    await expect.poll(popupSeen).toEqual({ ua: expect.stringMatching(/Firefox\/\d+/), uad: 'undefined', chrome: 'undefined' });

    // Leaving the sign-in page brings the Chrome identity back.
    await inPages(app, `location.href = 'http://127.0.0.1:${port}/after'`);
    await expect.poll(async () => (await inPages<Seen>(app, READ))[0]).toEqual({ ua: expect.stringMatching(/Chrome\/\d+/), uad: 'object', chrome: 'object' });
    await expect.poll(attached).toBe(true);
    expect(await dialogs()).toEqual({ native: false, bridge: 'function' });
  } finally {
    await app.close();
    server.close();
  }
});
