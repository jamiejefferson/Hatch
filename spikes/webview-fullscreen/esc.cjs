// What happens to a webview in HTML full screen when Esc arrives?
const { app, BrowserWindow, webContents } = require('electron');
const page = `<div id=player style="width:300px;height:150px;background:#222"></div><button id=b onclick="document.getElementById('player').requestFullscreen()">go</button>`;
const t0 = Date.now(); const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1), ...a);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 700, webPreferences: { webviewTag: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<webview id=w src="data:text/html,${encodeURIComponent(page)}" style="width:600px;height:400px"></webview>`));
  await new Promise((r) => setTimeout(r, 1500));
  const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview');
  for (const e of ['enter-html-full-screen', 'leave-html-full-screen']) { g.on(e, () => log('guest', e)); win.on(e, () => log('win', e)); }
  for (const e of ['enter-full-screen', 'leave-full-screen']) win.on(e, () => log('win', e));
  if (process.argv.includes('--fix')) {
    let full = false;
    g.on('enter-html-full-screen', () => (full = true)); g.on('leave-html-full-screen', () => (full = false));
    g.on('before-input-event', (event, input) => { if (full && input.type === 'keyDown' && input.key === 'Escape') { event.preventDefault(); void g.executeJavaScript('document.exitFullscreen()'); } });
  }
  g.on('render-process-gone', (_e, d) => log('gone', d.reason)); g.on('unresponsive', () => log('unresponsive'));
  const ask = (code) => Promise.race([g.executeJavaScript(code), new Promise((r) => setTimeout(() => r('NO ANSWER'), 1500))]);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  setInterval(async () => log('beat', await ask("(document.fullscreenElement?.id ?? 'none') + ' ' + innerWidth"), await Promise.race([win.webContents.executeJavaScript("document.fullscreenElement?.tagName ?? 'none'"), wait(1000).then(() => 'UI NO ANSWER')]), win.isFullScreen()), 1000);
  g.executeJavaScript("document.getElementById('b').click()", true);
  await wait(2500);
  log('real esc'); require('child_process').exec(`osascript -e 'tell application "System Events" to key code 53'`, (e) => e && log('osascript', e.message));
  await wait(3000);
  log('again'); g.executeJavaScript("document.getElementById('b').click()", true);
  await wait(2500);
  log('real esc'); require('child_process').exec(`osascript -e 'tell application "System Events" to key code 53'`, (e) => e && log('osascript', e.message));
  await wait(3000);
  app.exit(0);
});
