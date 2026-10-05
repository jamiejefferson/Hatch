// Google refuses to sign anyone in from an embedded Chromium: "This browser or app may not be secure".
// A probe on 2026-10-05 (spikes/google-signin.mjs) found that a Firefox identity gets past the check, when every Chromium-only
// sign goes with it: the user agent, the Sec-CH-UA request headers, navigator.userAgentData and window.chrome.
// Each sign alone failed, which is what the probe of 2026-09-18 tried. Hatch wears that identity on Google's sign-in pages alone,
// because sites that read the user agent serve Chrome its best version, and Hatch is Chrome everywhere else.

/** Firefox on a Mac, as Google's sign-in page sees it. Google rejects old browsers, so each release may need a newer number. */
export const FIREFOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0';

export const SIGNIN_HOSTS = ['accounts.google.com'];

/** Whether a page at this address signs the user in to Google, so Hatch shows it as Firefox. `extra` lets the tests name a stand-in host. */
export function wantsFirefox(url: string, extra: string[] = []): boolean {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname } = new URL(url);
  return (protocol === 'https:' || protocol === 'http:') && [...SIGNIN_HOSTS, ...extra].includes(hostname);
}

/** Request headers with the Chromium-only client hints removed and the Firefox user agent in place. */
export function asFirefoxHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) if (!/^sec-ch-ua/i.test(key) && key.toLowerCase() !== 'user-agent') out[key] = value;
  out['User-Agent'] = FIREFOX_UA;
  return out;
}

/**
 * Runs in the page's own world before its scripts, so the page finds no Chromium-only objects and reads Firefox's user agent,
 * including in a pop-up whose first page loads before the main process can change its user agent. It is sent as source, so it
 * refers to nothing outside itself.
 */
export function hideChromium(ua: string): void {
  const page = globalThis as unknown as { Navigator?: { prototype: object } };
  const fake = (target: object, key: string, value: unknown): void => {
    try {
      Object.defineProperty(target, key, { get: () => value, configurable: true });
    } catch {}
  };
  if (page.Navigator) {
    fake(page.Navigator.prototype, 'userAgentData', undefined);
    fake(page.Navigator.prototype, 'userAgent', ua);
    fake(page.Navigator.prototype, 'appVersion', '5.0 (Macintosh)');
    fake(page.Navigator.prototype, 'vendor', '');
  }
  fake(globalThis, 'chrome', undefined);
}
