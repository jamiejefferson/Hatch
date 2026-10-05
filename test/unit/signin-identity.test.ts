import { describe, expect, it } from 'vitest';
import { asFirefoxHeaders, FIREFOX_UA, wantsFirefox } from '@shared/signin-identity';

describe('wantsFirefox', () => {
  it("names Google's sign-in host and nothing else", () => {
    expect(wantsFirefox('https://accounts.google.com/v3/signin/identifier?hl=en')).toBe(true);
    expect(wantsFirefox('https://docs.google.com/spreadsheets')).toBe(false);
    expect(wantsFirefox('https://accounts.google.com.example.com/')).toBe(false);
    expect(wantsFirefox('not a link')).toBe(false);
    expect(wantsFirefox('file:///accounts.google.com')).toBe(false);
  });

  it('takes stand-in hosts for the tests', () => {
    expect(wantsFirefox('http://localhost:4000/signin', ['localhost'])).toBe(true);
  });
});

describe('asFirefoxHeaders', () => {
  it('drops every client hint and puts the Firefox user agent in place of Chrome', () => {
    expect(asFirefoxHeaders({ 'User-Agent': 'Chrome', 'sec-ch-ua': '"Chromium"', 'Sec-CH-UA-Platform': '"macOS"', 'sec-ch-ua-full-version-list': 'x', Accept: 'text/html' })).toEqual({ Accept: 'text/html', 'User-Agent': FIREFOX_UA });
  });
});
