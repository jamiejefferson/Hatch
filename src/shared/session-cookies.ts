// Session cookies, the ones with no expiry, which Chromium drops when Hatch quits. Hatch keeps them in a file of its own,
// so a site that signs the user in with one stays signed in after a restart, as Chrome and Safari do when they reopen their windows.

/** The parts of a cookie Hatch writes down. */
export interface KeptCookie {
  domain: string;
  /** True when the cookie belongs to its host alone, with no leading dot. */
  hostOnly: boolean;
  name: string;
  value: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

const SAME_SITES = new Set(['unspecified', 'no_restriction', 'lax', 'strict']);

/** Reads the file back, dropping any entry that does not have the shape of a cookie. */
export function readKept(body: unknown): KeptCookie[] {
  if (!Array.isArray(body)) return [];
  return body.filter(
    (c): c is KeptCookie =>
      typeof c === 'object' && c !== null &&
      typeof c.domain === 'string' && c.domain !== '' && typeof c.name === 'string' && typeof c.value === 'string' &&
      typeof c.path === 'string' && typeof c.secure === 'boolean' && typeof c.httpOnly === 'boolean' && typeof c.hostOnly === 'boolean' &&
      SAME_SITES.has(c.sameSite),
  );
}

/** What Electron's `cookies.set` takes to put a cookie back. With no expiry it stays a session cookie. */
export function setDetailsFor(c: KeptCookie): { url: string; name: string; value: string; path: string; secure: boolean; httpOnly: boolean; sameSite: KeptCookie['sameSite']; domain?: string } {
  const host = c.domain.replace(/^\./, '');
  return {
    url: `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`,
    name: c.name,
    value: c.value,
    path: c.path || '/',
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    ...(c.hostOnly ? {} : { domain: c.domain }),
  };
}
