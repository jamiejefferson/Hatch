import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { session, type Cookie } from 'electron';
import { readKept, setDetailsFor, type KeptCookie } from '@shared/session-cookies';
import { dataFile, PAGES_PARTITION } from '../paths';

/** Writing waits this long after the last change, because a page sets many cookies at once. */
const WRITE_DELAY_MS = 1000;

const file = (): string => dataFile('session-cookies.json');
const jar = () => session.fromPartition(PAGES_PARTITION).cookies;
let timer: ReturnType<typeof setTimeout> | null = null;

const keep = (c: Cookie): KeptCookie => ({
  domain: c.domain ?? '',
  hostOnly: c.hostOnly === true,
  name: c.name,
  value: c.value,
  path: c.path ?? '/',
  secure: c.secure === true,
  httpOnly: c.httpOnly === true,
  sameSite: c.sameSite,
});

/** Writes every session cookie of the pages session. The file holds sign-ins, so only the user's account may read it. */
async function write(): Promise<void> {
  timer = null;
  const cookies = (await jar().get({})).filter((c) => c.session && c.domain);
  writeFileSync(file(), `${JSON.stringify(cookies.map(keep))}\n`, { mode: 0o600 });
}

/**
 * Puts last run's session cookies back before any page loads, then keeps the file current as pages change their cookies.
 * A cookie a site has since set again, or removed, follows the site: the file is rewritten from the live jar after every change.
 */
export async function keepSessionCookies(): Promise<void> {
  const kept = readKept(await readFile(file(), 'utf8').then(JSON.parse, () => []));
  await Promise.all(kept.map((c) => jar().set(setDetailsFor(c)).catch(() => {})));
  jar().on('changed', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void write().catch((error) => console.error('[cookies] Hatch could not keep the session cookies:', error)), WRITE_DELAY_MS);
  });
}

/** Quitting writes the newest cookies at once, in place of waiting for the delay. */
export async function saveSessionCookiesNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  await write().catch(() => {});
}
