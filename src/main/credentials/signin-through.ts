// Signing in through another browser, for a sign-in Hatch cannot finish. See @shared/signin-through.
import { ipcMain, type WebContents } from 'electron';
import { siteOf } from '@shared/cookie-import';
import { signInStart, type SignInThrough } from '@shared/signin-through';
import { allPages, pageFor, waitForPage } from '../hatches/registry';
import { push } from '../renderer-rpc';

/** The sign-in for a Hatch: the page the user began from and its site. Null when the Hatch shows no web page. */
export function signInThrough(hatchId: string, reason: SignInThrough['reason']): SignInThrough | null {
  return startOf(pageFor(hatchId)?.guest, hatchId, reason);
}

/** The same, for the menu, which may ask about a Hatch whose page is still registering. */
export async function signInThroughWhenReady(hatchId: string): Promise<SignInThrough | null> {
  return startOf((await waitForPage(hatchId, 3000))?.guest, hatchId, 'user');
}

function startOf(guest: WebContents | undefined, hatchId: string, reason: SignInThrough['reason']): SignInThrough | null {
  if (!guest || guest.isDestroyed()) return null;
  const url = signInStart(guest.navigationHistory.getAllEntries().map((e) => e.url), guest.navigationHistory.getActiveIndex());
  return url ? { hatchId, url, site: siteOf(new URL(url).hostname), reason } : null;
}

export function setUpSignInThrough(): void {
  // A page asked for a passkey and the preload refused it. Hatch offers to finish the sign-in in the user's own browser.
  // A site may ask again as it falls back, so one offer per Hatch covers 20 seconds.
  const offered = new Map<string, number>();
  ipcMain.on('guest:passkey', (event, host: unknown) => {
    const hatchId = allPages().find((p) => p.guest === event.sender)?.hatchId;
    const key = hatchId ?? String(host);
    if (Date.now() - (offered.get(key) ?? 0) < 20_000) return;
    offered.set(key, Date.now());
    const through = hatchId ? signInThrough(hatchId, 'passkey') : null;
    if (through) return push('signin:through', through);
    const site = typeof host === 'string' && host ? host : 'This site';
    push('toast', `${site} asked for a passkey, which Hatch cannot use. Choose another way to sign in, or sign in with Chrome and bring the sign-in across in Settings.`);
  });
}
