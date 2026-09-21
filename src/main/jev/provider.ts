// Jev answers at two addresses: TypeSafe's own service, and OpenRouter's Decisions endpoint, which passes the same request to TypeSafe.
// The user pastes one key and Hatch reads which service it belongs to from its first characters. Pure code with no Electron imports.

export type Provider = 'typesafe' | 'openrouter';

/** Every OpenRouter key starts with "sk-or-". Any other key goes to TypeSafe. */
export const providerOf = (key: string): Provider => (key.trim().startsWith('sk-or-') ? 'openrouter' : 'typesafe');

export const PROVIDER_NAME: Record<Provider, string> = { typesafe: 'TypeSafe', openrouter: 'OpenRouter' };

const URLS: Record<Provider, string> = {
  typesafe: 'https://api.typesafe.ai/v1/systemone',
  openrouter: 'https://openrouter.ai/api/alpha/decisions',
};

/** HATCH_JEV_URL points the tests at a stand-in service, whichever key is saved. */
export const urlFor = (provider: Provider, override = ''): string => override || URLS[provider];

/** OpenRouter names a model with its maker first, and marks an alias that follows the newest version with "~". */
export const modelFor = (provider: Provider, model: string): string => (provider === 'openrouter' ? `~typesafe/${model}` : model);

/** The same questions and the same state go to either service. The model name alone differs. */
export const bodyFor = <R extends { model: string }>(provider: Provider, request: R): R => ({ ...request, model: modelFor(provider, request.model) });

/** Where the user gets a key, for the messages an agent reads. */
export const KEY_PAGES = 'console.typesafe.ai/settings/keys or openrouter.ai/keys';
