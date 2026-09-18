// Saved sign-ins. credentials.json lists site, username and a reference. The password sits in secrets.json,
// encrypted by Electron safeStorage with a key that macOS keeps in the Keychain.
import { safeStorage } from 'electron';
import { siteFromInput, type SignIn } from '@shared/signins';
import { newId } from '@shared/workspace';
import { HatchError } from '../cdp/session';
import { dataFile } from '../paths';
import { push } from '../renderer-rpc';
import { getProxyPort, projectsState } from '../servers/manager';
import { JsonStore } from '../store/json-store';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const list = new JsonStore<SignIn[]>(dataFile('credentials.json'), (raw) =>
  (Array.isArray(raw) ? raw : []).filter(isRecord).flatMap((r) =>
    typeof r.id === 'string' && typeof r.site === 'string' && typeof r.username === 'string' ? [{ id: r.id, site: r.site, username: r.username, allow: r.allow === 'always' ? ('always' as const) : ('ask' as const) }] : [],
  ),
);
const secrets = new JsonStore<Record<string, string>>(dataFile('secrets.json'), (raw) => (isRecord(raw) ? Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string')) : {}));

export const listSignIns = (): Promise<SignIn[]> => list.read();
const publish = (all: SignIn[]): SignIn[] => {
  push('signins:state', all);
  return all;
};

export async function addSignIn(input: { site: string; username: string; password: string }): Promise<SignIn[]> {
  const username = String(input.username ?? '').trim();
  const password = String(input.password ?? '');
  if (!username) throw new HatchError('A sign-in needs a username.');
  if (!password) throw new HatchError('A sign-in needs a password.');
  const parsed = siteFromInput(String(input.site ?? ''), (await projectsState(false)).projects, getProxyPort());
  if ('error' in parsed) throw new HatchError(parsed.error);
  if (!safeStorage.isEncryptionAvailable()) throw new HatchError('macOS refused Hatch access to the Keychain, so Hatch cannot store a password safely.');

  const existing = (await list.read()).find((s) => s.site === parsed.site && s.username === username);
  const id = existing?.id ?? newId('signin');
  await secrets.update((all) => ({ ...all, [id]: safeStorage.encryptString(password).toString('base64') }));
  return publish(await list.update((all) => (existing ? all : [...all, { id, site: parsed.site, username, allow: 'ask' }])));
}

export async function removeSignIn(id: string): Promise<SignIn[]> {
  await secrets.update(({ [id]: _gone, ...rest }) => rest);
  return publish(await list.update((all) => all.filter((s) => s.id !== id)));
}

export const setAllow = async (id: string, allow: SignIn['allow']): Promise<SignIn[]> => publish(await list.update((all) => all.map((s) => (s.id === id ? { ...s, allow: allow === 'always' ? 'always' : 'ask' } : s))));

/** Only the fill routine calls this. The value never goes into a tool reply, a log line or a message to the interface. */
export async function passwordOf(id: string): Promise<string> {
  const cipher = (await secrets.read())[id];
  if (!cipher) throw new HatchError('Hatch holds no password for that sign-in. Save it again in the Sign-ins panel.');
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    throw new HatchError('Hatch could not unlock that password from the Keychain. Save the sign-in again in the Sign-ins panel.');
  }
}
