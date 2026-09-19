// The one place Hatch talks to TypeSafe. The user's key sits in jev.json as a safeStorage cipher, the way passwords do.
// HATCH_JEV_URL points the tests at a stand-in service, and no test calls the real one.
import { safeStorage } from 'electron';
import { HatchError } from '../cdp/session';
import { dataFile } from '../paths';
import { JsonStore } from '../store/json-store';
import type { ChoiceAnswer, JevRequest } from './pick';

const jevUrl = (): string => process.env.HATCH_JEV_URL || 'https://api.typesafe.ai/v1/systemone';
const store = new JsonStore<{ key?: string }>(dataFile('jev.json'), (raw) => (raw && typeof raw === 'object' && typeof (raw as { key?: unknown }).key === 'string' ? { key: (raw as { key: string }).key } : {}));

export const hasKey = async (): Promise<boolean> => !!(await store.read()).key;

export async function setKey(key: string): Promise<boolean> {
  const value = String(key ?? '').trim();
  if (!value) {
    await store.write({});
    return false;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new HatchError('macOS refused Hatch access to the Keychain, so Hatch cannot store the key safely.');
  await store.write({ key: safeStorage.encryptString(value).toString('base64') });
  return true;
}

async function keyValue(): Promise<string> {
  const cipher = (await store.read()).key;
  if (!cipher) throw new HatchError('Hatch holds no TypeSafe key, so it cannot find an element from a description. The user adds one in Hatch under Settings. Until then, call snapshot and pass ref.');
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    throw new HatchError('Hatch could not unlock the TypeSafe key from the Keychain. The user saves it again in Hatch under Settings. Until then, call snapshot and pass ref.');
  }
}

export async function askJev(request: JevRequest, timeoutMs = 8000): Promise<Record<string, ChoiceAnswer>> {
  const key = await keyValue();
  let res: Response;
  try {
    res = await fetch(jevUrl(), { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new HatchError(`TypeSafe gave no answer within ${Math.round(timeoutMs / 1000)} seconds. Call snapshot and pass ref.`);
  }
  if (res.status === 401 || res.status === 403) throw new HatchError('TypeSafe refused the key saved in Hatch. The user checks it in Hatch under Settings. Until then, call snapshot and pass ref.');
  if (!res.ok) throw new HatchError(`TypeSafe answered with status ${res.status}. Call snapshot and pass ref.`);
  const body = (await res.json().catch(() => null)) as { answers?: Record<string, ChoiceAnswer> } | null;
  if (!body?.answers) throw new HatchError('TypeSafe sent an answer Hatch could not read. Call snapshot and pass ref.');
  return body.answers;
}
