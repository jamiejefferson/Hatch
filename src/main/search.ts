import { net } from 'electron';
import { readSuggestions } from '@shared/search';

/** Google's suggestion service, the one Firefox's search box uses. `HATCH_SUGGEST_URL` points the tests at a stand-in. */
const SUGGEST_URL = process.env.HATCH_SUGGEST_URL ?? 'https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&q=';

/** Suggestions for what the user has typed in the New Hatch box. A failure answers with none, because the box works without them. */
export async function suggest(text: string): Promise<string[]> {
  const query = text.trim();
  if (!query) return [];
  try {
    const res = await net.fetch(SUGGEST_URL + encodeURIComponent(query), { signal: AbortSignal.timeout(2500) });
    return res.ok ? readSuggestions(await res.json(), query) : [];
  } catch {
    return [];
  }
}
