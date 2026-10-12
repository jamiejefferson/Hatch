import { describe, expect, it } from 'vitest';
import { identityPage, signInStart } from '@shared/signin-through';

describe('signInStart', () => {
  it('walks back past Apple and the site\'s own sign-in page to the page the user started from', () => {
    const history = ['https://www.seloger.com/annonces/123', 'https://signin.seloger.com/u/login?state=abc', 'https://appleid.apple.com/auth/authorize?client_id=x&state=y'];
    expect(signInStart(history, 2)).toBe('https://www.seloger.com/annonces/123');
  });

  it('falls back to the site when every page of it was part of the sign-in', () => {
    expect(signInStart(['https://signin.seloger.com/u/login?state=abc', 'https://appleid.apple.com/auth/authorize?state=y'], 1)).toBe('https://seloger.com/');
  });

  it('keeps a page that is no sign-in', () => {
    expect(signInStart(['https://example.com/account'], 0)).toBe('https://example.com/account');
  });

  it('signs in to the identity page\'s own site when the Hatch opened there', () => {
    expect(signInStart(['https://login.microsoftonline.com/common/oauth2/authorize?state=1'], 0)).toBe('https://login.microsoftonline.com/');
  });

  it('stops at another site', () => {
    const history = ['https://news.example/', 'https://app.figma.com/files', 'https://accounts.google.com/signin?continue=x'];
    expect(signInStart(history, 2)).toBe('https://app.figma.com/files');
  });

  it('reads the entry the Hatch shows, not the last one', () => {
    expect(signInStart(['https://a.example/', 'https://b.example/'], 0)).toBe('https://a.example/');
  });

  it('answers null for a Hatch with no web page', () => {
    expect(signInStart(['about:blank'], 0)).toBeNull();
    expect(signInStart([], 0)).toBeNull();
  });
});

describe('identityPage', () => {
  it('knows the pages that sign in for other sites', () => {
    expect(identityPage('https://appleid.apple.com/auth/authorize')).toBe(true);
    expect(identityPage('https://acme.okta.com/login')).toBe(true);
    expect(identityPage('https://www.apple.com/')).toBe(false);
  });
});
