// Runs before a page's scripts, in every frame of the pages session, so it covers Hatches and the sign-in pop-ups they open.
// It builds as its own file, because a sandboxed preload cannot require a second one.
// On Google's sign-in pages it hides the Chromium-only objects; the main process decides which pages. Everywhere else it
// refuses passkey requests, which Electron would leave waiting for ever (see @shared/passkeys).
import { contextBridge, ipcRenderer } from 'electron';
import { FIREFOX_UA, hideChromium } from '@shared/signin-identity';
import { PASSKEY_REFUSED, refusePasskeys } from '@shared/passkeys';

try {
  if (ipcRenderer.sendSync('guest:firefox', location.href) === true) contextBridge.executeInMainWorld({ func: hideChromium, args: [FIREFOX_UA] });
  else {
    contextBridge.executeInMainWorld({ func: refusePasskeys, args: [PASSKEY_REFUSED] });
    window.addEventListener(PASSKEY_REFUSED, () => ipcRenderer.send('guest:passkey', location.hostname));
  }
} catch {}
