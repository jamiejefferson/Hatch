// Hatch as the Mac's default browser: a link clicked in another app opens in a new Hatch.
import { app } from 'electron';

export type DefaultBrowserState = 'default' | 'other' | 'unavailable';

const SCHEMES = ['http', 'https'];

/** macOS lists the packaged app alone as a browser, because the http and https schemes sit in its Info.plist. A checkout would register the bare Electron binary. */
export function defaultBrowserState(): DefaultBrowserState {
  if (!app.isPackaged) return 'unavailable';
  return SCHEMES.every((scheme) => app.isDefaultProtocolClient(scheme)) ? 'default' : 'other';
}

/** macOS asks the user to confirm the change in its own dialog, so the answer arrives later. The interface reads the state again when the window regains focus. */
export function makeDefaultBrowser(): DefaultBrowserState {
  if (app.isPackaged) SCHEMES.forEach((scheme) => app.setAsDefaultProtocolClient(scheme));
  return defaultBrowserState();
}
