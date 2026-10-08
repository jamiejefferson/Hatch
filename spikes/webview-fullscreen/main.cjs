// Which debugger domain stops a webview leaving HTML full screen? Run: electron main.cjs <Domain.method>...
const { app, BrowserWindow, webContents } = require('electron');
const page = `<div id=player style="width:300px;height:150px;background:#222"></div><button id=b onclick="document.getElementById('player').requestFullscreen()">go</button>`;
const methods = process.argv.slice(2).filter((a) => /^[A-Z]\w+\.\w+$/.test(a));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 700, webPreferences: { webviewTag: true } });
  await win.loadURL('data:text/html,' + encodeURIComponent(`<webview id=w src="data:text/html,${encodeURIComponent(page)}" style="width:600px;height:400px"></webview>`));
  await new Promise((r) => setTimeout(r, 1500));
  const g = webContents.getAllWebContents().find((w) => w.getType() === 'webview');
  if (methods.length) { g.debugger.attach('1.3'); for (const m of methods) await g.debugger.sendCommand(m, m.startsWith('Emulation') ? { enabled: true } : {}); }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = async (label) => console.log(methods.join(',') || 'none', label, await g.executeJavaScript("document.fullscreenElement?.id ?? 'none'"), await win.webContents.executeJavaScript("document.fullscreenElement?.tagName ?? 'none'"), win.isFullScreen());
  g.executeJavaScript("document.getElementById('b').click()", true);
  await wait(2000); await state('entered');
  g.executeJavaScript('document.exitFullscreen()');
  await wait(2000); await state('after exit');
  app.exit(0);
});
