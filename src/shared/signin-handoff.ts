// The sign-in a browser extension hands to Hatch: one site's cookies, read in the browser itself, so no Keychain question comes up.
import { inSite, siteOf } from './cookie-import';

/** Hatch's extension for Chrome, Arc, Brave and Edge. Its manifest carries a fixed key, so every unpacked copy has this id. */
export const EXTENSION_IDS = ['hokaggdcgckaklkhecpnpplhmdbmmjjk'];
export const HANDOFF_PATH = '/signin';
/** A browser holds a few hundred cookies for one site at most. More than this is no sign-in. */
export const HANDOFF_LIMIT = 1000;

/** A cookie as `chrome.cookies.getAll` gives it. */
interface BrowserCookie {
  domain: string;
  hostOnly: boolean;
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  session: boolean;
  expirationDate?: number;
}

export interface CookieDetails {
  url: string;
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
  domain?: string;
  expirationDate?: number;
}

export type Handoff = { ok: true; site: string; browser: string; cookies: CookieDetails[] } | { ok: false; error: string };

const SAME_SITES = new Set(['unspecified', 'no_restriction', 'lax', 'strict']);

const isCookie = (c: unknown): c is BrowserCookie => {
  const o = c as Record<string, unknown>;
  return typeof c === 'object' && c !== null && typeof o.domain === 'string' && typeof o.name === 'string' && typeof o.value === 'string' && typeof o.path === 'string';
};

/** True when the request comes from Hatch's own extension. A web page cannot set another origin, so a page never passes. */
export const fromExtension = (origin: string | undefined): boolean => EXTENSION_IDS.some((id) => origin === `chrome-extension://${id}`);

/** Checks what the extension sent and turns each cookie of the site into what Electron's `cookies.set` takes. Cookies of other sites drop out. */
export function readHandoff(body: unknown): Handoff {
  const o = (body ?? {}) as { site?: unknown; browser?: unknown; cookies?: unknown };
  if (typeof o.site !== 'string' || !o.site || !Array.isArray(o.cookies)) return { ok: false, error: 'Hatch expected a site and its cookies.' };
  if (o.cookies.length > HANDOFF_LIMIT) return { ok: false, error: 'That is more cookies than one sign-in holds.' };
  const site = siteOf(o.site);
  const browser = typeof o.browser === 'string' && o.browser.trim() ? o.browser.trim().slice(0, 40) : 'your browser';
  const cookies = o.cookies.filter(isCookie).filter((c) => inSite(c.domain, site)).map((c): CookieDetails => {
    const host = c.domain.replace(/^\./, '');
    return {
      url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
      name: c.name,
      value: c.value,
      path: c.path || '/',
      secure: c.secure === true,
      httpOnly: c.httpOnly === true,
      sameSite: SAME_SITES.has(c.sameSite) ? (c.sameSite as CookieDetails['sameSite']) : 'unspecified',
      // A cookie for the domain and everything under it keeps its domain. A host-only cookie belongs to that host alone.
      ...(c.hostOnly ? {} : { domain: c.domain }),
      ...(!c.session && typeof c.expirationDate === 'number' ? { expirationDate: c.expirationDate } : {}),
    };
  });
  if (cookies.length === 0) return { ok: false, error: `The browser holds no cookies for ${site}. Sign in to ${site} there first.` };
  return { ok: true, site, browser, cookies };
}
