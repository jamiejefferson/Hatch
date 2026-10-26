import { describe, expect, it } from 'vitest';
import { googleSearch, readSuggestions, SUGGESTION_LIMIT } from '@shared/search';

describe('search from the New Hatch box', () => {
  it('opens Google results for the text', () => {
    expect(googleSearch(' new york times ')).toBe('https://www.google.com/search?q=new%20york%20times');
  });

  it("reads Google's suggestions, leaving out the query and repeats", () => {
    const body = ['awwwards', ['awwwards', 'awwwards fonts', 'Awwwards Fonts', 'awwwards academy', 7], [], {}];
    expect(readSuggestions(body, 'Awwwards')).toEqual(['awwwards fonts', 'awwwards academy']);
  });

  it('keeps to the limit and survives a strange answer', () => {
    expect(readSuggestions(['q', Array.from({ length: 10 }, (_, i) => `q ${i}`)], 'q')).toHaveLength(SUGGESTION_LIMIT);
    expect(readSuggestions({ error: true }, 'q')).toEqual([]);
    expect(readSuggestions(null, 'q')).toEqual([]);
  });
});
