// Phase 0 spike runner. Throwaway code: it proves mechanics and ships nowhere.
// Usage: pnpm spike <zoom|teardown|dialogs|perf|picker|mcp|paper|look>
import { app, BrowserWindow, clipboard, ClipboardItem, ipcMain, webContents } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const which = process.argv.slice(2).find((a) => !a.startsWith('-')) ?? 'zoom';
const fixture = pathToFileURL(join(here, 'fixtures/form.html')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = { x: 40, y: 40 };

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};

async function makeHost() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: { webviewTag: true, contextIsolation: false, nodeIntegration: false },
  });
  await win.loadFile(join(here, 'fixtures/host.html'));
  return win;
}

const host = (win, js) => win.webContents.executeJavaScript(js, true);

async function attach(guestId) {
  const guest = webContents.fromId(guestId);
  guest.debugger.attach('1.3');
  const send = (method, params) => guest.debugger.sendCommand(method, params);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { guest, send, evaluate };
}

const pngSize = (base64) => {
  const b = Buffer.from(base64, 'base64');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

async function cdpClick(send, x, y) {
  const base = { x, y, button: 'left', clickCount: 1 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
}

// Real-input stand-in: CDP on the HOST page, which goes through Chromium's
// input router and hit-tests into the guest frame, as a real mouse would.
let hostDebugger = null;
async function hostSend(win, method, params) {
  if (!hostDebugger) {
    win.webContents.debugger.attach('1.3');
    hostDebugger = win.webContents.debugger;
  }
  return hostDebugger.sendCommand(method, params);
}

async function hostClick(win, x, y) {
  const base = { x, y, button: 'left', clickCount: 1 };
  await hostSend(win, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await hostSend(win, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await hostSend(win, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  await sleep(150);
}

async function hostWheel(win, x, y, deltaY) {
  await hostSend(win, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
}

// Spikes 1, 3 and 5 (the parts a script can judge).
async function zoom() {
  const win = await makeHost();
  await host(win, `setCanvas(${ORIGIN.x}, ${ORIGIN.y}, 0.4)`);
  const id = await host(win, `addGuest('g1', ${JSON.stringify(fixture)})`);
  const { send, evaluate } = await attach(id);
  const dpr = await evaluate('devicePixelRatio');
  const centre = { x: 700, y: 324 }; // #target centre in page pixels

  for (const scale of [0.4, 0.62, 1.0]) {
    await host(win, `setCanvas(${ORIGIN.x}, ${ORIGIN.y}, ${scale})`);
    await sleep(300);

    const size = await evaluate('({ w: innerWidth, h: innerHeight })');
    record(`layout stays 960 x 752 at ${scale}`, size.w === 960 && size.h === 752, size);

    const before = await evaluate('__clicks');
    await cdpClick(send, centre.x, centre.y);
    await sleep(100);
    record(`CDP click hits at ${scale}`, (await evaluate('__clicks')) === before + 1, await evaluate('__lastClick'));

    const mid = await evaluate('__clicks');
    await hostClick(win, ORIGIN.x + centre.x * scale, ORIGIN.y + centre.y * scale);
    const last = await evaluate('__lastClick');
    const landed = (await evaluate('__clicks')) === mid + 1;
    const offset = last ? { dx: last.x - centre.x, dy: last.y - centre.y } : null;
    record(`real input hits through the transform at ${scale}`, landed && Math.abs(offset.dx) <= 2 && Math.abs(offset.dy) <= 2, { landed, offset });

    const shot = pngSize((await send('Page.captureScreenshot', { format: 'png' })).data);
    record(`screenshot is full size at ${scale}`, shot.width === 960 * dpr && shot.height === 752 * dpr, { ...shot, dpr });
  }

  // Window hidden: the agent still drives and captures.
  await host(win, `setCanvas(${ORIGIN.x}, ${ORIGIN.y}, 0.4)`);
  win.hide();
  await sleep(500);
  const before = await evaluate('__clicks');
  await cdpClick(send, centre.x, centre.y);
  await sleep(100);
  record('CDP click hits with the window hidden', (await evaluate('__clicks')) === before + 1, {});
  await send('Runtime.evaluate', { expression: "document.getElementById('email').focus()" });
  await send('Input.insertText', { text: 'sam@studio.example' });
  record('insertText fills with the window hidden', (await evaluate("document.getElementById('email').value")) === 'sam@studio.example', {});
  const hiddenShot = await Promise.race([
    send('Page.captureScreenshot', { format: 'png' }).then((r) => pngSize(r.data)),
    sleep(5000).then(() => null),
  ]);
  record('screenshot returns with the window hidden', !!hiddenShot && hiddenShot.width === 960 * dpr, hiddenShot ?? 'timed out after 5 s');
  win.show();
  await sleep(300);

  // Resize in place: a taller Hatch changes innerHeight with no reload.
  const loadId = await evaluate('__loadId');
  await host(win, "sizeGuest('g1', 960, 1450)");
  await sleep(400);
  const tall = await evaluate('({ h: innerHeight, loadId: __loadId })');
  record('taller Hatch changes innerHeight with no reload', tall.h === 1450 && tall.loadId === loadId, tall);
  await host(win, "sizeGuest('g1', 960, 752)");

  // Shield gating: wheel over a shielded Hatch reaches the canvas only.
  const wheelAt = { x: ORIGIN.x + 480 * 0.4, y: ORIGIN.y + 376 * 0.4 };
  const wheel = () => hostWheel(win, wheelAt.x, wheelAt.y, 120);
  await host(win, 'setShield(true)');
  await sleep(100);
  const hostBefore = await host(win, '__wheel');
  await wheel();
  await sleep(300);
  record('shielded Hatch leaves the page unscrolled', (await evaluate('scrollY')) === 0 && (await host(win, '__wheel')) > hostBefore, { scrollY: await evaluate('scrollY') });
  await host(win, 'setShield(false)');
  await sleep(100);
  await wheel();
  await sleep(500);
  record('selected Hatch scrolls its page', (await evaluate('scrollY')) > 0, { scrollY: await evaluate('scrollY') });
}

// Spike 2: destroy a webview that has a debugger attached, many times.
async function teardown() {
  const win = await makeHost();
  await host(win, `setCanvas(${ORIGIN.x}, ${ORIGIN.y}, 0.4)`);
  const rounds = 200;
  let done = 0;
  for (let i = 0; i < rounds; i += 1) {
    const id = await host(win, `addGuest('g${i}', ${JSON.stringify(fixture)})`);
    const { send } = await attach(id);
    await send('Accessibility.getFullAXTree');
    await host(win, `removeGuest('g${i}')`);
    await sleep(20);
    done += 1;
  }
  record(`${rounds} attach, read and remove rounds with no main-process crash`, done === rounds, { done });

  // Closing a tab removes several guests in one tick.
  const ids = [];
  for (let i = 0; i < 4; i += 1) ids.push(await host(win, `addGuest('t${i}', ${JSON.stringify(fixture)})`));
  for (const id of ids) await attach(id);
  await host(win, "['t0','t1','t2','t3'].forEach(removeGuest)");
  await sleep(500);
  record('four attached guests removed in one tick', true, {});
}

// Spike 8: JavaScript dialogs inside a guest.
async function dialogs() {
  const win = await makeHost();
  const id = await host(win, `addGuest('g1', ${JSON.stringify(fixture)})`);
  const { guest, send, evaluate } = await attach(id);
  const seen = [];
  guest.debugger.on('message', (_e, method, params) => {
    if (method !== 'Page.javascriptDialogOpening') return;
    seen.push({ type: params.type, message: params.message });
    send('Page.handleJavaScriptDialog', { accept: true, promptText: 'typed by agent' });
  });
  for (const expr of ["alert('hello')", "confirm('sure?')", "prompt('name?')"]) {
    const value = await Promise.race([evaluate(expr).catch((e) => `THREW ${e.message}`), sleep(4000).then(() => 'TIMEOUT')]);
    const ok = value !== 'TIMEOUT' && !String(value).startsWith('THREW');
    record(expr.startsWith('prompt') ? 'native prompt() throws in a guest' : `${expr} answered over CDP`, expr.startsWith('prompt') ? !ok : ok, { value: value ?? null });
  }
  record('native prompt() throws in a guest, alert and confirm report', seen.length === 2, seen);

  // Workaround: a preload stand-in blocks the page on a sync IPC call, and the main process answers later.
  const preload = pathToFileURL(join(here, 'fixtures/guest-preload.cjs')).href;
  const id2 = await host(win, `addGuest('g2', ${JSON.stringify(fixture)}, { preload: ${JSON.stringify(preload)}, x: 1000 })`);
  const second = await attach(id2);
  // The preload installs the stand-in itself, so it must survive a reload.
  await host(win, "document.getElementById('g2').reload()");
  await sleep(1000);
  const asked = [];
  ipcMain.on('hatch-prompt', (event, message, fallback) => {
    asked.push({ message, fallback, from: event.sender.id });
    setTimeout(() => { event.returnValue = asked.length === 1 ? 'typed by agent' : null; }, 500);
  });
  const t = performance.now();
  const answer = await Promise.race([second.evaluate("prompt('name?', 'Sam')").catch((e) => `THREW ${e.message}`), sleep(4000).then(() => 'TIMEOUT')]);
  const waited = Math.round(performance.now() - t);
  record('prompt() stand-in blocks the page and returns a late answer', answer === 'typed by agent' && waited >= 450, { answer, waited, asked });
  const cancelled = await Promise.race([second.evaluate("prompt('again?')").catch((e) => `THREW ${e.message}`), sleep(4000).then(() => 'TIMEOUT')]);
  record('prompt() stand-in returns null on cancel', cancelled === null, { cancelled });
  record('the request names its guest', asked.every((a) => a.from === id2), { id2 });

  // Which reload and navigate routes keep a guest alive, and do they touch the host page?
  await host(win, "window.__marker = 'original host'");
  const routes = [
    ['webContents.reload()', () => second.guest.reload()],
    ['CDP Page.navigate to the same address', () => second.send('Page.navigate', { url: fixture })],
    ['CDP Runtime.evaluate location.reload()', () => second.send('Runtime.evaluate', { expression: 'location.reload()' })],
  ];
  for (const [label, reload] of routes) {
    if (second.guest.isDestroyed()) { record(`${label} keeps the guest`, false, 'guest already destroyed'); continue; }
    await second.evaluate("window.__stale = true");
    await Promise.resolve(reload()).catch((e) => console.log(label, 'threw', e.message));
    await sleep(1000);
    const hostKept = (await host(win, 'window.__marker').catch(() => null)) === 'original host';
    const state = second.guest.isDestroyed() ? 'destroyed' : await second.evaluate("({ ready: document.readyState, fresh: !window.__stale, prompt: typeof window.__hatchPrompt })").catch((e) => `THREW ${e.message}`);
    record(`${label} reloads the guest and leaves the host page alone`, hostKept && state?.ready === 'complete' && state.fresh && state.prompt === 'function', { hostKept, state });
  }

  // Finding, Electron 44: Page.reload sent to a guest reloads the HOST page, which destroys every guest.
  // Product rule: reload through webContents.reload() and never send Page.reload.
  await second.send('Page.reload').catch(() => {});
  await sleep(1000);
  const hostKept = (await host(win, 'window.__marker').catch(() => null)) === 'original host';
  record('finding reproduces: CDP Page.reload on a guest reloads the host page', !hostKept && second.guest.isDestroyed(), { hostKept, guestDestroyed: second.guest.isDestroyed() });
}

// Spike 4: six heavy pages under animated pan and zoom.
async function perf() {
  const win = await makeHost();
  const sites = [
    'https://www.theguardian.com/uk',
    'https://www.bbc.co.uk/news',
    'https://github.com/electron/electron',
    'https://www.apple.com/uk/',
    'https://stripe.com/gb',
    'https://en.wikipedia.org/wiki/Web_browser',
  ];
  await host(win, 'setCanvas(0, 0, 0.3)');
  const slots = sites.map((src, i) => ({ id: `p${i}`, src, x: (i % 3) * 1000, y: Math.floor(i / 3) * 800 }));
  const loaded = await Promise.all(slots.map((s) => Promise.race([
    host(win, `addGuest(${JSON.stringify(s.id)}, ${JSON.stringify(s.src)}, { x: ${s.x}, y: ${s.y} })`),
    sleep(20000).then(() => null),
  ])));
  record('six live pages load', loaded.every(Boolean), { loaded: loaded.filter(Boolean).length });
  await sleep(12000);

  for (const hint of ['auto', 'transform']) {
    await host(win, `document.getElementById('canvas').style.willChange = ${JSON.stringify(hint)}`);
    await sleep(500);
    for (const mode of ['pan', 'zoom', 'zoom']) {
      const stats = await host(win, `runPerf(10, ${JSON.stringify(mode)})`);
      record(`${mode} holds at least 55 fps for ten seconds (will-change: ${hint})`, stats.fps >= 55 && stats.over100ms === 0, stats);
    }
  }
  await host(win, "document.getElementById('canvas').style.willChange = 'auto'");

  // Blank tiles: jump the zoom, wait 200 ms, then look for a Hatch drawn as one flat colour.
  for (const scale of [0.3, 1.0]) {
    await host(win, 'setCanvas(0, 0, 0.6)');
    await sleep(400);
    await host(win, `setCanvas(0, 0, ${scale})`);
    await sleep(200);
    const image = await win.webContents.capturePage();
    // The bitmap may hold more pixels than getSize() reports, so derive its real width.
    const size = image.getSize();
    const bitmap = image.toBitmap();
    const pxWidth = Math.round(Math.sqrt((bitmap.length / 4) * (size.width / size.height)));
    const factor = pxWidth / win.getContentSize()[0];
    const flat = [];
    for (const s of slots) {
      const rect = { x: s.x * scale, y: s.y * scale, w: 960 * scale, h: 752 * scale };
      if (rect.x + rect.w > win.getContentSize()[0] || rect.y + rect.h > win.getContentSize()[1]) continue;
      const colours = new Set();
      for (let gy = 1; gy < 20; gy += 1) {
        for (let gx = 1; gx < 20; gx += 1) {
          const px = Math.floor((rect.x + (rect.w * gx) / 20) * factor);
          const py = Math.floor((rect.y + (rect.h * gy) / 20) * factor);
          const o = (py * pxWidth + px) * 4;
          colours.add(`${bitmap[o] >> 3},${bitmap[o + 1] >> 3},${bitmap[o + 2] >> 3}`);
        }
      }
      if (colours.size < 3) flat.push(s.id);
    }
    record(`no blank Hatch 200 ms after a zoom jump to ${scale}`, flat.length === 0, { flat });
  }
}

// Spike 6: host-drawn picker highlight and a pin that follows a scrolling page.
async function picker() {
  const win = await makeHost();
  const scale = 0.62;
  await host(win, `setCanvas(${ORIGIN.x}, ${ORIGIN.y}, ${scale})`);
  const preload = pathToFileURL(join(here, 'fixtures/guest-preload.cjs')).href;
  const id = await host(win, `addGuest('g1', ${JSON.stringify(fixture)}, { preload: ${JSON.stringify(preload)} })`);
  const { send, evaluate } = await attach(id);
  await send('DOM.enable');
  await send('DOM.getDocument', { depth: 0 });

  const boxAt = async (x, y) => {
    const node = await send('DOM.getNodeForLocation', { x, y });
    const { model } = await send('DOM.getBoxModel', { backendNodeId: node.backendNodeId });
    const q = model.border;
    return { x: q[0], y: q[1], w: q[2] - q[0], h: q[5] - q[1] };
  };

  const box = await boxAt(700, 324);
  record('picker finds the element box under a point', box.x === 600 && box.y === 300 && box.w === 200 && box.h === 48, box);
  const mapped = { x: ORIGIN.x + box.x * scale, y: ORIGIN.y + box.y * scale, w: box.w * scale, h: box.h * scale };
  await host(win, `drawHighlight(${JSON.stringify(mapped)})`);

  const times = [];
  for (let i = 0; i < 100; i += 1) {
    const t = performance.now();
    await boxAt(50 + ((i * 37) % 860), 60 + ((i * 53) % 640));
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const median = Math.round(times[50] * 100) / 100;
  const p95 = Math.round(times[95] * 100) / 100;
  record('picker lookup finishes inside one 16.7 ms frame', p95 < 16.7, { medianMs: median, p95Ms: p95 });

  // After a 100 px scroll the button sits at viewport y 200 to 248 and document y 300 to 348.
  await evaluate('scrollTo(0, 100)');
  await sleep(150);
  const tagAt = async (x, y) => {
    const node = await send('DOM.getNodeForLocation', { x, y });
    const { node: described } = await send('DOM.describeNode', { backendNodeId: node.backendNodeId });
    return described.nodeName;
  };
  const byViewport = await tagAt(700, 224);
  const byDocument = await tagAt(700, 324);
  // Finding, Chrome 152: the lookup takes document coordinates, and getBoxModel answers in viewport coordinates.
  record('getNodeForLocation finds the button in one of the two coordinate spaces', byViewport === 'BUTTON' || byDocument === 'BUTTON', { space: byViewport === 'BUTTON' ? 'viewport' : 'document' });
  const scrolled = await boxAt(700, byViewport === 'BUTTON' ? 224 : 324);
  record('getBoxModel returns a viewport-relative box after a scroll', scrolled.y === 200, scrolled);
  await evaluate('scrollTo(0, 0)');
  await sleep(150);

  // Pin anchored at the button's top-left, page coordinates (600, 300).
  await host(win, `trackPin('g1', 600, 300, ${scale}, ${ORIGIN.x}, ${ORIGIN.y})`);
  const at = { x: ORIGIN.x + 480 * scale, y: ORIGIN.y + 376 * scale };
  for (let i = 0; i < 90; i += 1) {
    await hostWheel(win, at.x, at.y, 24);
    await sleep(16);
  }
  await sleep(600);
  const lags = (await host(win, '__lags')).sort((a, b) => a - b);
  const scrollY = await evaluate('scrollY');
  const pinY = await host(win, '__pinY');
  const expected = ORIGIN.y + (300 - scrollY) * scale;
  record('pin ends where the element ends', Math.abs(pinY - expected) < 0.5, { pinY, expected, scrollY });
  const lag = { samples: lags.length, medianMs: Math.round(lags[Math.floor(lags.length / 2)] * 10) / 10, p95Ms: Math.round(lags[Math.floor(lags.length * 0.95)] * 10) / 10, worstMs: Math.round(lags.at(-1) * 10) / 10 };
  record('pin update reaches the host inside one 16.7 ms frame of the scroll event', lags.length > 20 && lag.p95Ms <= 16.7, lag);
}

// Spike 9: write the payload shape Paper's Snapshot extension writes, for a manual paste into Paper.
// The extension (v0.3.12) writes one clipboard type, text/html, holding
// <x-paper-html>…</x-paper-html> around HTML with inline styles.
async function paper() {
  const inner = [
    '<div style="display:flex;flex-direction:column;gap:12px;width:320px;padding:24px;background-color:rgb(255,255,255);border-radius:12px;border:1px solid rgb(220,220,220);font-family:Inter,system-ui,sans-serif;">',
    '<div style="font-size:20px;font-weight:600;color:rgb(17,17,17);">Written by Hatch</div>',
    '<div style="font-size:14px;line-height:20px;color:rgb(90,90,90);">This card came from a script. It should paste as editable layers.</div>',
    '<div style="display:flex;align-items:center;justify-content:center;height:40px;border-radius:8px;background-color:rgb(47,107,255);color:rgb(255,255,255);font-size:14px;font-weight:500;">Start free trial</div>',
    '</div>',
  ].join('');
  // Electron 44 replaced the old clipboard.write({ html }) with a ClipboardItem API.
  await clipboard.write([new ClipboardItem({ 'text/html': `<x-paper-html>${inner}</x-paper-html>` })]);
  const [item] = await clipboard.read();
  const back = await (await item.getType('text/html')).text();
  record('clipboard holds the x-paper-html payload', back.includes('<x-paper-html>'), { types: item.types });
  console.log('\nNow paste into Paper (Cmd+V). Editable layers mean Hatch can write the format.');
}

// Spike 1, the part only a person can judge: native popups at a fractional canvas zoom.
// Usage: pnpm spike look [scale]. The window stays open until the person closes it.
async function look() {
  const scale = Number(process.argv.slice(2).filter((a) => !a.startsWith('-'))[1] ?? 0.62);
  const win = await makeHost();
  await host(win, `setCanvas(${ORIGIN.x}, ${ORIGIN.y}, ${scale})`);
  await host(win, `addGuest('g1', ${JSON.stringify(fixture)})`);
  console.log(`Canvas zoom ${scale}. Check: the Plan dropdown opens under its field, right-click opens a menu at the pointer, text selects under the pointer, and accented input (hold e) shows its popup at the caret.`);
  await new Promise((resolve) => win.on('closed', resolve));
}

async function mcp() {
  const spike = await import('./mcp.mjs');
  await spike.mcp(record);
}

const spikes = { zoom, teardown, dialogs, perf, picker, paper, mcp, look };

app.whenReady().then(async () => {
  let crashed = null;
  try {
    await spikes[which]();
  } catch (err) {
    crashed = String(err?.stack ?? err);
    console.error(crashed);
  }
  const dir = join(here, 'results');
  mkdirSync(dir, { recursive: true });
  const summary = { spike: which, electron: process.versions.electron, chrome: process.versions.chrome, crashed, results };
  writeFileSync(join(dir, `${which}.json`), JSON.stringify(summary, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${which}: ${results.length - failed} passed, ${failed} failed${crashed ? ', runner threw' : ''}`);
  app.exit(failed || crashed ? 1 : 0);
});
