import { describe, expect, it } from 'vitest';
import { chromeTimeToUnix, inSite, siteOf } from '@shared/cookie-import';
import { decryptValue, keyFromPassword } from '../../src/main/credentials/cookie-crypto';
import { encrypt } from '../cookie-fixture';

describe('the site a page belongs to', () => {
  it('takes the last two labels, and three under a two-letter country suffix', () => {
    expect(siteOf('app.figma.com')).toBe('figma.com');
    expect(siteOf('figma.com')).toBe('figma.com');
    expect(siteOf('shop.example.co.uk')).toBe('example.co.uk');
    expect(siteOf('www.example.de')).toBe('example.de');
    expect(siteOf('127.0.0.1')).toBe('127.0.0.1');
    expect(siteOf('localhost')).toBe('localhost');
  });

  it('keeps cookies inside the site and leaves look-alike domains out', () => {
    expect(inSite('.figma.com', 'figma.com')).toBe(true);
    expect(inSite('auth.figma.com', 'figma.com')).toBe(true);
    expect(inSite('notfigma.com', 'figma.com')).toBe(false);
    expect(inSite('figma.com.evil.test', 'figma.com')).toBe(false);
  });
});

describe('Chrome cookie values', () => {
  it('decrypts a value with and without the domain hash that file version 24 added', () => {
    const key = keyFromPassword('peanuts');
    expect(decryptValue(encrypt('abc123', '.figma.com', 'peanuts', 24), key, 24)).toBe('abc123');
    expect(decryptValue(encrypt('abc123', '.figma.com', 'peanuts', 23), key, 23)).toBe('abc123');
  });

  it('answers null for a wrong key or an unknown format', () => {
    expect(decryptValue(encrypt('abc123', 'x', 'peanuts', 24), keyFromPassword('other'), 24)).not.toBe('abc123');
    expect(decryptValue(Buffer.from('v11whatever'), keyFromPassword('peanuts'), 24)).toBeNull();
  });

  it('converts a Chrome time to Unix seconds', () => {
    expect(chromeTimeToUnix(13_400_000_000_000_000)).toBe(1_755_526_400);
  });
});
