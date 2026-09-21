// The one place Hatch talks to Jev, through TypeSafe or through OpenRouter. The user's key sits in jev.json as a safeStorage cipher, the way passwords do.
// HATCH_JEV_URL points the tests at a stand-in service, and no test calls the real one.
import { safeStorage } from 'electron';
import { HatchError } from '../cdp/session';
import { dataFile } from '../paths';
import { JsonStore } from '../store/json-store';
import type { ChoiceAnswer, JevRequest } from './pick';
import { bodyFor, KEY_PAGES, PROVIDER_NAME, providerOf, urlFor, type Provider } from './provider';

const jevUrl = (key: string): string => urlFor(providerOf(key), process.env.HATCH_JEV_URL);
const store = new JsonStore<{ key?: string }>(dataFile('jev.json'), (raw) => (raw && typeof raw === 'object' && typeof (raw as { key?: unknown }).key === 'string' ? { key: (raw as { key: string }).key } : {}));

export const hasKey = async (): Promise<boolean> => !!(await store.read()).key;

export async function setKey(key: string): Promise<boolean> {
  const value = String(key ?? '').trim();
  if (!value) {
    await store.write({});
    return false;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new HatchError('macOS refused Hatch access to the Keychain, so Hatch cannot store the key safely.');
  await checkKey(value);
  await store.write({ key: safeStorage.encryptString(value).toString('base64') });
  return true;
}

/** One small question proves the key works, so the user hears about a mistyped key now and the agent never does. */
async function checkKey(key: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(jevUrl(key), { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyFor(providerOf(key), { state: 'Hello.', model: 'jev-latest', questions: { check: { type: 'noul', instructions: 'Is this a greeting?' } } })), signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HatchError('Hatch could not reach Jev to check the key. Check the internet connection and try again.');
  }
  if (res.status === 401 || res.status === 403) throw new HatchError(`${PROVIDER_NAME[providerOf(key)]} did not accept that key. Check it and paste it again.`);
  if (res.status === 402) throw new HatchError('That OpenRouter account holds no credit. Add credit at openrouter.ai/credits and try again.');
  if (!res.ok) throw new HatchError(`Jev could not check the key just now (status ${res.status}). Try again in a moment.`);
}

/** The saved key comes first. TYPESAFE_API_KEY in the environment stands in when Settings holds none, and OPENROUTER_API_KEY after it. */
const envKey = (): string => (process.env.TYPESAFE_API_KEY ?? '').trim() || (process.env.OPENROUTER_API_KEY ?? '').trim();
const NOT_CONNECTED = 'Jev is not connected. The user connects it in Hatch under Settings, in "Connect Jev", with a key from ' + KEY_PAGES + '. Until then, call snapshot and pass ref.';

async function keyValue(): Promise<string> {
  const cipher = (await store.read()).key;
  if (!cipher) {
    if (envKey()) return envKey();
    throw new HatchError(NOT_CONNECTED);
  }
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    throw new HatchError('Hatch could not unlock the Jev key from the Keychain. The user connects Jev again in Hatch under Settings. Until then, call snapshot and pass ref.');
  }
}

/** Whether a run can reach Jev at all: a saved key, or one in the environment. */
export const canAsk = async (): Promise<boolean> => (await hasKey()) || !!envKey();

/** The last four characters of the saved key, which let the user tell one key from another. The rest never leaves the main process. */
export async function keyHint(): Promise<string> {
  if (!(await hasKey())) return '';
  return (await keyValue().catch(() => '')).slice(-4);
}

/** Which service the saved key belongs to, so Settings can name it. */
export async function keyProvider(): Promise<Provider | ''> {
  if (!(await hasKey())) return '';
  const key = await keyValue().catch(() => '');
  return key ? providerOf(key) : '';
}

/** Asks Jev one small question with the saved key, for the "Test the connection" button. */
export const testKey = async (): Promise<true> => (await checkKey(await keyValue()), true);

/** OpenRouter reports what a call cost. TypeSafe reports tokens alone, and the run prices them. */
export interface Usage { input_tokens: number; output_tokens: number; cost?: number }

export async function askJevWithUsage(request: JevRequest, timeoutMs = 8000): Promise<{ answers: Record<string, ChoiceAnswer>; usage: Usage }> {
  const key = await keyValue();
  const service = PROVIDER_NAME[providerOf(key)];
  let res: Response;
  try {
    res = await fetch(jevUrl(key), { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyFor(providerOf(key), request)), signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new HatchError(`${service} gave no answer within ${Math.round(timeoutMs / 1000)} seconds. Call snapshot and pass ref.`);
  }
  if (res.status === 401 || res.status === 403) throw new HatchError('Jev refused the key saved in Hatch. The user connects Jev again in Hatch under Settings. Until then, call snapshot and pass ref.');
  if (res.status === 402) throw new HatchError('The OpenRouter account behind Jev holds no credit. The user adds credit at openrouter.ai/credits. Until then, call snapshot and pass ref.');
  if (res.status === 429) throw new HatchError(`${service} limited the rate of calls. Try again in 30 seconds to a minute. Until then, call snapshot and pass ref.`);
  if (!res.ok) throw new HatchError(`${service} answered with status ${res.status}. Call snapshot and pass ref.`);
  const body = (await res.json().catch(() => null)) as { answers?: Record<string, ChoiceAnswer>; usage?: Partial<Usage> } | null;
  if (!body?.answers) throw new HatchError(`${service} sent an answer Hatch could not read. Call snapshot and pass ref.`);
  const cost = Number(body.usage?.cost);
  return { answers: body.answers, usage: { input_tokens: Number(body.usage?.input_tokens) || 0, output_tokens: Number(body.usage?.output_tokens) || 0, ...(Number.isFinite(cost) && cost >= 0 ? { cost } : {}) } };
}

export const askJev = async (request: JevRequest, timeoutMs = 8000): Promise<Record<string, ChoiceAnswer>> => (await askJevWithUsage(request, timeoutMs)).answers;
