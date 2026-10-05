// Hides the Chromium-only objects from Google's sign-in pages before their scripts run. The main process decides which pages.
// The pages session registers this file for every frame, so it covers Hatches and the sign-in pop-ups they open. It builds as its
// own file, because a sandboxed preload cannot require a second one.
import { contextBridge, ipcRenderer } from 'electron';
import { FIREFOX_UA, hideChromium } from '@shared/signin-identity';

try {
  if (ipcRenderer.sendSync('guest:firefox', location.href) === true) contextBridge.executeInMainWorld({ func: hideChromium, args: [FIREFOX_UA] });
} catch {}
