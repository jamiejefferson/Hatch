// Pure parts of "bring a sign-in from another browser": which cookies belong to a site, and how Chrome writes a time.

/** A browser profile that holds a cookie file Hatch can read. */
export interface BrowserProfile {
  /** `chrome:Default`, which names the browser and the profile folder. */
  id: string;
  browser: string;
  /** The name the user gave the profile, shown when a browser has more than one. */
  profile: string;
}

export interface ImportOutcome {
  site: string;
  browser: string;
  count: number;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * The site a page belongs to: `app.figma.com` gives `figma.com`, and `shop.example.co.uk` gives `example.co.uk`.
 * A sign-in often sits on the parent domain or on a sibling such as `auth.`, so the import takes the whole site.
 * The two-letter rule covers suffixes such as co.uk and com.au without a suffix list.
 */
export function siteOf(host: string): string {
  const clean = host.toLowerCase().replace(/\.$/, '');
  if (IPV4.test(clean) || !clean.includes('.')) return clean;
  const labels = clean.split('.');
  const tld = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  const take = tld.length === 2 && second.length <= 3 && labels.length >= 3 ? 3 : 2;
  return labels.slice(-take).join('.');
}

/** True when a cookie's domain, as Chrome stores it with or without a leading dot, sits inside the site. */
export function inSite(cookieDomain: string, site: string): boolean {
  const domain = cookieDomain.toLowerCase().replace(/^\./, '');
  return domain === site || domain.endsWith(`.${site}`);
}

/** Chrome counts microseconds from 1601. Electron wants seconds from 1970. */
export const chromeTimeToUnix = (microseconds: number): number => microseconds / 1_000_000 - 11_644_473_600;
