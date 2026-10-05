// Throwaway probe hook, loaded into Hatch's main process with NODE_OPTIONS. When a Hatch shows Google's address step, it clicks the
// field, types an address that belongs to no account and presses Enter through Electron's input path, then writes what Google answered.
const { app } = require('electron');
const { writeFileSync } = require('node:fs');
const OUT = process.env.PROBE_OUT;
let done = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('web-contents-created', (_e, wc) => {
  wc.on('did-finish-load', async () => {
    if (done || wc.getType() !== 'webview' || !wc.getURL().includes('accounts.google.com/v3/signin/identifier')) return;
    done = true;
    await wait(3000);
    const seen = await wc.executeJavaScript(`({ ua: navigator.userAgent, uad: typeof navigator.userAgentData, chrome: typeof window.chrome, webdriver: navigator.webdriver, alertNative: String(window.alert).includes('native'), debugger: null })`);
    seen.debugger = wc.debugger.isAttached();
    const r = await wc.executeJavaScript(`(() => { const b = document.querySelector('input[name=identifier], input[type=email]').getBoundingClientRect(); return { x: Math.round(b.left + 30), y: Math.round(b.top + b.height / 2) }; })()`);
    wc.focus();
    wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await wait(400);
    for (const ch of 'hatch.probe.nobody.48213@gmail.com') { wc.sendInputEvent({ type: 'char', keyCode: ch }); await wait(35); }
    await wait(500);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    wc.sendInputEvent({ type: 'char', keyCode: '\r' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await wait(9000);
    const text = await wc.executeJavaScript(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 200)`);
    writeFileSync(OUT, JSON.stringify({ seen, url: wc.getURL().slice(0, 80), text }, null, 1));
  });
});
