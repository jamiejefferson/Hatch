// Brings a site's sign-in from another browser on this Mac. Google refuses to sign anyone in inside Electron,
// so the user signs in to the site in Chrome and Hatch copies that one site's cookies into its own session.
// Chrome, Arc, Brave and Edge share one format: a SQLite file whose values are AES-128-CBC under a key from the macOS Keychain.
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { session, type CookiesSetDetails } from 'electron';
import { chromeTimeToUnix, inSite, siteOf, type BrowserProfile, type ImportOutcome } from '@shared/cookie-import';
import { HatchError } from '../cdp/session';
import { decryptValue, keyFromPassword } from './cookie-crypto';
import { PAGES_PARTITION } from '../paths';

const run = promisify(execFile);

interface Browser { id: string; name: string; folder: string; keychainService: string; keychainAccount: string }

const BROWSERS: Browser[] = [
  { id: 'chrome', name: 'Chrome', folder: 'Google/Chrome', keychainService: 'Chrome Safe Storage', keychainAccount: 'Chrome' },
  { id: 'arc', name: 'Arc', folder: 'Arc/User Data', keychainService: 'Arc Safe Storage', keychainAccount: 'Arc' },
  { id: 'brave', name: 'Brave', folder: 'BraveSoftware/Brave-Browser', keychainService: 'Brave Safe Storage', keychainAccount: 'Brave' },
  { id: 'edge', name: 'Edge', folder: 'Microsoft Edge', keychainService: 'Microsoft Edge Safe Storage', keychainAccount: 'Microsoft Edge' },
];

// The tests point these at a folder and a key of their own, so no test touches the user's browser or the Keychain.
const root = (): string => process.env.HATCH_BROWSER_ROOT || join(homedir(), 'Library', 'Application Support');
const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false);

async function cookieFile(browser: Browser, profile: string): Promise<string | null> {
  for (const path of [join(root(), browser.folder, profile, 'Cookies'), join(root(), browser.folder, profile, 'Network', 'Cookies')]) if (await exists(path)) return path;
  return null;
}

/** Every browser profile on this Mac that holds a cookie file. */
export async function listBrowserProfiles(): Promise<BrowserProfile[]> {
  const found: BrowserProfile[] = [];
  for (const browser of BROWSERS) {
    const folders = (await readdir(join(root(), browser.folder)).catch(() => [] as string[])).filter((name) => name === 'Default' || /^Profile \d+$/.test(name));
    const names = await readFile(join(root(), browser.folder, 'Local State'), 'utf8')
      .then((text) => (JSON.parse(text) as { profile?: { info_cache?: Record<string, { name?: string }> } }).profile?.info_cache ?? {})
      .catch(() => ({}) as Record<string, { name?: string }>);
    for (const folder of folders) if (await cookieFile(browser, folder)) found.push({ id: `${browser.id}:${folder}`, browser: browser.name, profile: names[folder]?.name || folder });
  }
  return found;
}

/** macOS asks the user before it hands over the key, and the user may refuse. */
async function safeStorageKey(browser: Browser): Promise<Buffer> {
  const password = process.env.HATCH_BROWSER_KEY ?? (await run('/usr/bin/security', ['find-generic-password', '-w', '-s', browser.keychainService, '-a', browser.keychainAccount]).then(
    (out) => out.stdout.trim(),
    () => {
      throw new HatchError(`macOS did not hand over ${browser.name}'s cookie key. Choose Allow when the Keychain asks, or sign in with an email and a password instead.`);
    },
  ));
  return keyFromPassword(password);
}

interface Row { host_key: string; name: string; value: string; encrypted: string; path: string; expires_utc: number; is_secure: number; is_httponly: number; has_expires: number; samesite: number }

const SAME_SITE: Record<number, CookiesSetDetails['sameSite']> = { 0: 'no_restriction', 1: 'lax', 2: 'strict' };

/** Copies one site's cookies from a browser profile into the session Hatch's pages share. */
export async function importSignIn(pageUrl: string, profileId: string): Promise<ImportOutcome> {
  if (!URL.canParse(pageUrl) || !/^https?:$/.test(new URL(pageUrl).protocol)) throw new HatchError('Open the site in the selected Hatch first. Hatch copies the sign-in for the site that Hatch shows.');
  const site = siteOf(new URL(pageUrl).hostname);
  const [browserId, profile = 'Default'] = profileId.split(':');
  const browser = BROWSERS.find((b) => b.id === browserId);
  const source = browser && (await cookieFile(browser, profile));
  if (!browser || !source) throw new HatchError('Hatch found no cookie file for that browser.');

  // The browser keeps its file open, so Hatch reads a copy. The write-ahead file holds the newest cookies.
  const work = await mkdtemp(join(tmpdir(), 'hatch-cookies-'));
  try {
    await copyFile(source, join(work, 'Cookies'));
    await copyFile(`${source}-wal`, join(work, 'Cookies-wal')).catch(() => {});
    const like = site.replace(/[%_']/g, '');
    const sql = `select (select value from meta where key = 'version') as version; select host_key, name, value, hex(encrypted_value) as encrypted, path, expires_utc, is_secure, is_httponly, has_expires, samesite from cookies where top_frame_site_key = '' and (host_key = '${like}' or host_key like '%.${like}');`;
    const { stdout } = await run('/usr/bin/sqlite3', ['-json', join(work, 'Cookies'), sql], { maxBuffer: 32 * 1024 * 1024 }).catch(() => {
      throw new HatchError(`Hatch could not read ${browser.name}'s cookie file.`);
    });
    // sqlite3 prints one JSON array per statement.
    const [meta, rows = []] = stdout.trim().split(/\n(?=\[)/).map((part) => JSON.parse(part)) as [{ version: string }[], Row[] | undefined];
    const wanted = rows.filter((row) => inSite(row.host_key, site));
    if (wanted.length === 0) throw new HatchError(`${browser.name} holds no cookies for ${site}. Sign in to ${site} in ${browser.name} first, then try again.`);

    const key = wanted.some((row) => row.encrypted) ? await safeStorageKey(browser) : Buffer.alloc(16);
    const fileVersion = Number(meta[0]?.version ?? 0);
    const jar = session.fromPartition(PAGES_PARTITION).cookies;
    let count = 0;
    for (const row of wanted) {
      const value = row.encrypted ? decryptValue(Buffer.from(row.encrypted, 'hex'), key, fileVersion) : row.value;
      if (value === null) continue;
      const host = row.host_key.replace(/^\./, '');
      const details: CookiesSetDetails = { url: `${row.is_secure ? 'https' : 'http'}://${host}${row.path}`, name: row.name, value, path: row.path, secure: row.is_secure === 1, httpOnly: row.is_httponly === 1, sameSite: SAME_SITE[row.samesite] ?? 'unspecified' };
      // A leading dot marks a cookie for the domain and everything under it. Without one the cookie belongs to that host alone.
      if (row.host_key.startsWith('.')) details.domain = row.host_key;
      if (row.has_expires) details.expirationDate = chromeTimeToUnix(row.expires_utc);
      await jar.set(details).then(() => count++, () => {});
    }
    if (count === 0) throw new HatchError(`Hatch could not read the cookies ${browser.name} holds for ${site}. The Keychain key may have changed.`);
    await jar.flushStore();
    return { site, browser: browser.name, count };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
