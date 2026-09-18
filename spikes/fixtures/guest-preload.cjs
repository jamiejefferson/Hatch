// Spike 6 guest preload: report every scroll to the host with a wall-clock stamp.
const { ipcRenderer } = require('electron');

window.addEventListener('scroll', () => {
  ipcRenderer.sendToHost('scroll', { y: window.scrollY, t: performance.timeOrigin + performance.now() });
}, { passive: true, capture: true });

// Spike 8: Electron throws on prompt(), so the page gets a blocking stand-in that asks the main process.
const { contextBridge, webFrame } = require('electron');
contextBridge.exposeInMainWorld('__hatchPrompt', (message, fallback) => ipcRenderer.sendSync('hatch-prompt', String(message ?? ''), String(fallback ?? '')));
webFrame.executeJavaScript('window.prompt = (m, d) => window.__hatchPrompt(m, d);');
