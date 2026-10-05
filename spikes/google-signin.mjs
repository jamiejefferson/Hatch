// Throwaway probe: which browser identity gets past Google's "This browser or app may not be secure" check at the email step.
// Types an address that belongs to no account. "Couldn't find your Google Account" means the browser check passed.
import { app, BrowserWindow, session } from 'electron';
import { writeFileSync } from 'node:fs';

const EMAIL = 'hatch.probe.nobody.48213@gmail.com';
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

// Hides what only Chromium has, before any page script runs.
const HIDE = `(() => {
  try { Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true }); } catch {}
  try { delete window.chrome; Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true }); } catch {}
})();`;

const CONFIGS = [
  { name: 'firefox-full + dialog stand-ins', ua: FIREFOX_UA, strip: true, hide: true, dialogs: true },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(config, i) {
  const ses = session.fromPartition(`probe-${i}-${Date.now()}`);
  ses.setUserAgent(config.ua);
  if (config.strip) {
    ses.webRequest.onBeforeSendHeaders((details, done) => {
      const headers = { ...details.requestHeaders };
      for (const key of Object.keys(headers)) if (/^sec-ch-ua/i.test(key)) delete headers[key];
      headers['User-Agent'] = config.ua;
      done({ requestHeaders: headers });
    });
  }
  const prefs = config.hide ? { session: ses, sandbox: false, contextIsolation: false, preload: new URL(config.dialogs ? './google-hide-dialogs.cjs' : './google-hide.cjs', import.meta.url).pathname } : { session: ses, sandbox: true, contextIsolation: true };
  const win = new BrowserWindow({ width: 900, height: 800, show: true, webPreferences: prefs });
  // A redirect can reject the load promise while the page still arrives, so the probe waits for the field instead.
  if (config.detachFirst) {
    await win.loadURL('data:text/html,<h1>first</h1>');
    win.webContents.debugger.attach('1.3');
    for (const m of ['Page.enable', 'Runtime.enable', 'DOM.enable', 'Network.enable', 'Log.enable']) await win.webContents.debugger.sendCommand(m).catch(() => {});
    win.webContents.on('did-start-navigation', (d) => { if (d.isMainFrame && win.webContents.debugger.isAttached()) win.webContents.debugger.detach(); });
  }
  win.loadURL('https://accounts.google.com/ServiceLogin?hl=en', { userAgent: config.ua }).catch(() => {});
  for (let t = 0; t < 30; t++) {
    await wait(500);
    if (await win.webContents.executeJavaScript(`!!document.querySelector('input[name=identifier], input[type=email]')`).catch(() => false)) break;
  }
  await wait(800);
  if (config.debug) {
    win.webContents.debugger.attach('1.3');
    for (const m of ['Page.enable', 'Runtime.enable', 'DOM.enable', 'Network.enable', 'Log.enable']) await win.webContents.debugger.sendCommand(m).catch(() => {});
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  }
  const seen = await win.webContents.executeJavaScript(`JSON.stringify({ ua: navigator.userAgent, uad: typeof navigator.userAgentData, chrome: typeof window.chrome })`);
  win.focus();
  await win.webContents.executeJavaScript(`document.querySelector('input[name=identifier], input[type=email]')?.focus(); !!document.querySelector('input[name=identifier], input[type=email]')`);
  for (const ch of EMAIL) {
    win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await wait(40);
  }
  await wait(300);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await wait(7000);
  const text = await win.webContents.executeJavaScript(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 400)`);
  const url = win.webContents.getURL();
  win.destroy();
  const verdict = /may not be secure|Couldn.t sign you in/i.test(text) ? 'BLOCKED' : /Couldn.t find your Google Account|Enter your password|Welcome/i.test(text) ? 'PASSED' : 'UNCLEAR';
  return { name: config.name, verdict, seen: JSON.parse(seen), url: url.slice(0, 120), text };
}

app.whenReady().then(async () => {
  const results = [];
  for (const [i, c] of CONFIGS.entries()) {
    try { results.push(await probe(c, i)); } catch (e) { results.push({ name: c.name, verdict: 'ERROR', error: String(e) }); }
    console.log(JSON.stringify(results.at(-1)));
  }
  writeFileSync('spikes/results/google/results.json', JSON.stringify(results, null, 2));
  app.quit();
});
