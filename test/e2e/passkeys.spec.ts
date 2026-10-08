// Electron answers no passkey request on its own, so a site that asks for one (Microsoft's sign-in does) waited for ever.
// Hatch refuses the request at once, the site moves to its other ways to sign in, and the user reads why.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch } from './helpers';

const ASK = `navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), rpId: 'localhost', timeout: 60000 } })
  .then(() => 'resolved', (e) => e.name)`;

test('a passkey request is refused at once and the user hears what to do instead', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>Sign in</title><h1>Sign in</h1>');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  const { app, win } = await launch(freshHome());
  try {
    await openHatch(win, `http://localhost:${port}/`);
    await expect.poll(async () => (await inPages<string>(app, 'document.title'))[0]).toBe('Sign in');
    const started = Date.now();
    expect((await inPages<string>(app, ASK))[0]).toBe('NotAllowedError');
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(win.locator('.toast')).toContainText('localhost asked for a passkey, which Hatch cannot use.');
  } finally {
    await app.close();
    server.close();
  }
});
