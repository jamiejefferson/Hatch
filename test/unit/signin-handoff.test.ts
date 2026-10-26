import { describe, expect, it } from 'vitest';
import { fromExtension, readHandoff } from '@shared/signin-handoff';
import { readKept, setDetailsFor } from '@shared/session-cookies';

const cookie = (over: Record<string, unknown> = {}) => ({ domain: '.figma.com', hostOnly: false, name: 'sid', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'lax', session: false, expirationDate: 2_000_000_000, ...over });

describe('a sign-in from the browser extension', () => {
  it('takes requests from Hatch extension alone', () => {
    expect(fromExtension('chrome-extension://hokaggdcgckaklkhecpnpplhmdbmmjjk')).toBe(true);
    expect(fromExtension('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(fromExtension('https://evil.example')).toBe(false);
    expect(fromExtension(undefined)).toBe(false);
  });

  it("keeps the site's cookies and drops the rest", () => {
    const out = readHandoff({ site: 'www.figma.com', browser: 'Chrome', cookies: [cookie(), cookie({ domain: 'auth.figma.com', hostOnly: true, session: true, name: 'tmp' }), cookie({ domain: '.google.com' })] });
    expect(out).toEqual({
      ok: true,
      site: 'figma.com',
      browser: 'Chrome',
      cookies: [
        { url: 'https://figma.com/', name: 'sid', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'lax', domain: '.figma.com', expirationDate: 2_000_000_000 },
        { url: 'https://auth.figma.com/', name: 'tmp', value: 'abc', path: '/', secure: true, httpOnly: true, sameSite: 'lax' },
      ],
    });
  });

  it('refuses a request with no cookies for the site', () => {
    expect(readHandoff({ site: 'figma.com', cookies: [cookie({ domain: '.google.com' })] }).ok).toBe(false);
    expect(readHandoff({ cookies: [] }).ok).toBe(false);
    expect(readHandoff(null).ok).toBe(false);
  });
});

describe('session cookies kept across a restart', () => {
  it('reads back well-formed entries and drops broken ones', () => {
    const kept = { domain: 'app.example.com', hostOnly: true, name: 's', value: '1', path: '/', secure: false, httpOnly: false, sameSite: 'lax' as const };
    expect(readKept([kept, { name: 'broken' }, 7])).toEqual([kept]);
    expect(readKept('nonsense')).toEqual([]);
    expect(setDetailsFor(kept)).toEqual({ url: 'http://app.example.com/', name: 's', value: '1', path: '/', secure: false, httpOnly: false, sameSite: 'lax' });
    expect(setDetailsFor({ ...kept, domain: '.example.com', hostOnly: false, secure: true }).domain).toBe('.example.com');
  });
});
