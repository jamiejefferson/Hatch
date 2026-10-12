// Signing in through another browser. A sign-in Hatch cannot finish, such as one that asks for a passkey, opens in the
// user's own browser, where Touch ID and phone passkeys work, and Hatch then copies that one site's cookies across.
import { siteOf } from './cookie-import';

/** A sign-in the user may finish in another browser, for the Hatch that asked. */
export interface SignInThrough {
  hatchId: string;
  /** The page the user began signing in from, which opens in the other browser and in the Hatch afterwards. */
  url: string;
  /** The site whose cookies come across. */
  site: string;
  /** `passkey` when a page asked for a passkey, `user` when the user asked from the menu. */
  reason: 'passkey' | 'user';
}

// Pages that sign the user in for another site. Hatch walks back past these to the site the user wanted.
const IDENTITY_HOSTS = [
  /^appleid\.apple\.com$/,
  /^idmsa\.apple\.com$/,
  /^accounts\.google\.com$/,
  /^login\.microsoftonline\.com$/,
  /^login\.live\.com$/,
  /^login\.microsoft\.com$/,
  /^account\.live\.com$/,
  /\.okta\.com$/,
  /\.auth0\.com$/,
  /^www\.facebook\.com$/,
];

// A page in the middle of a sign-in carries a one-time state that another browser cannot use, so Hatch prefers a page before it.
const SIGN_IN_HOST = /^(signin|sign-in|login|auth|accounts?|sso|id|secure)\./;
const ONE_TIME = /[?&#](state|code|code_challenge|nonce|SAMLRequest|response_type)=/i;

const web = (url: string): URL | null => (URL.canParse(url) && /^https?:$/.test(new URL(url).protocol) ? new URL(url) : null);

export const identityPage = (url: string): boolean => {
  const u = web(url);
  return !!u && IDENTITY_HOSTS.some((host) => host.test(u.hostname));
};

const midSignIn = (u: URL): boolean => SIGN_IN_HOST.test(u.hostname) || ONE_TIME.test(u.search + u.hash);

/**
 * The page the user began signing in from, given the Hatch's history and the entry it shows. Hatch walks back past
 * identity pages such as Apple's, then through the site's own pages to the latest one that carries no one-time state.
 * Null when the Hatch shows no web page.
 */
export function signInStart(history: string[], index: number): string | null {
  let i = Math.min(index, history.length - 1);
  while (i >= 0 && !web(history[i]!)) i--;
  if (i < 0) return null;
  const shown = i;
  while (i >= 0 && identityPage(history[i]!)) i--;
  // A Hatch that opened on the identity page itself signs in to that page's own site.
  if (i < 0) return web(history[shown]!)!.origin + '/';
  const site = siteOf(web(history[i]!)!.hostname);
  let earliest = i;
  for (let j = i; j >= 0; j--) {
    const u = web(history[j]!);
    if (!u || siteOf(u.hostname) !== site) break;
    if (!midSignIn(u)) return u.href;
    earliest = j;
  }
  // Every page of the site was part of the sign-in, so the site's front page stands in.
  const first = web(history[earliest]!)!;
  return SIGN_IN_HOST.test(first.hostname) ? `${first.protocol}//${site}/` : `${first.origin}/`;
}
