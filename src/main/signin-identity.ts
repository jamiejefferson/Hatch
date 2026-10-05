// Shows Hatch as Firefox to Google's sign-in pages, in Hatches and in the sign-in pop-ups they open. See @shared/signin-identity.
import { join } from 'node:path';
import { app, ipcMain, session, type WebContents } from 'electron';
import { asFirefoxHeaders, FIREFOX_UA, wantsFirefox } from '@shared/signin-identity';
import { PAGES_PARTITION } from './paths';

/** `HATCH_FIREFOX_HOSTS` names stand-in hosts for the tests, which cannot reach Google. */
const extra = (): string[] => (process.env.HATCH_FIREFOX_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
export const firefoxPage = (url: string): boolean => wantsFirefox(url, extra());

export function setUpSigninIdentity(): void {
  const pages = session.fromPartition(PAGES_PARTITION);
  pages.registerPreloadScript({ type: 'frame', id: 'signin-identity', filePath: join(import.meta.dirname, '../preload/identity.cjs') });
  // Every request a sign-in page sends, its scripts and images included, carries the Firefox headers, so the page and its requests agree.
  pages.webRequest.onBeforeSendHeaders((details, done) => {
    const pageUrl = details.webContents?.getURL() ?? '';
    if (firefoxPage(details.url) || firefoxPage(pageUrl)) return done({ requestHeaders: asFirefoxHeaders(details.requestHeaders) });
    done({});
  });

  // navigator.userAgent comes from the page's own contents, so it changes as a navigation to or from a sign-in page starts.
  app.on('web-contents-created', (_event, contents) => {
    if (contents.session !== pages) return;
    watchNavigations(contents);
  });

  // The preload asks once per page whether to hide the Chromium-only objects. It sends its own address, because the contents
  // still report the previous page while the new one's preload runs.
  ipcMain.on('guest:firefox', (event, url: unknown) => {
    event.returnValue = typeof url === 'string' && firefoxPage(url);
  });
}

function watchNavigations(contents: WebContents): void {
  const chrome = app.userAgentFallback;
  contents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame) return;
    const ua = firefoxPage(details.url) ? FIREFOX_UA : chrome;
    if (contents.getUserAgent() !== ua) contents.setUserAgent(ua);
  });
}
