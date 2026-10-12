// Electron answers no passkey request on its own, so a site that asks for one (Microsoft's sign-in does) waited for ever.
// Hatch refuses the request at once, the site moves to its other ways to sign in, and Hatch offers the user's own browser.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { freshHome, inPages, launch, openHatch } from './helpers';

const ASK = `navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), rpId: 'localhost', timeout: 60000 } })
  .then(() => 'resolved', (e) => e.name)`;

test('a passkey request is refused at once and Hatch offers to sign in through another browser', async () => {
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
    await expect(win.getByTestId('signin-through')).toContainText('This sign-in asks for a passkey, which Hatch cannot use');
  } finally {
    await app.close();
    server.close();
  }
});
