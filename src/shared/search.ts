// Search from the New Hatch box: Google's results page, and the suggestions shown while the user types.

export const googleSearch = (text: string): string => `https://www.google.com/search?q=${encodeURIComponent(text.trim())}`;

/** The box shows this many suggestions under the search row. */
export const SUGGESTION_LIMIT = 6;

/** Reads Google's answer, `["query", ["suggestion", ...], ...]`, and drops the query itself and repeats. */
export function readSuggestions(body: unknown, query: string): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  const own = query.trim().toLowerCase();
  const seen = new Set<string>();
  return body[1]
    .filter((s): s is string => typeof s === 'string' && s.trim() !== '' && s.trim().toLowerCase() !== own)
    .filter((s) => !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, SUGGESTION_LIMIT);
}
