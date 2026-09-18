import { describe, expect, it } from 'vitest';
import { labelForUrl, parseAddress } from '@shared/address';

describe('parseAddress', () => {
  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['example.com', 'https://example.com/'],
    ['docs.example.co.uk/start', 'https://docs.example.co.uk/start'],
    ['localhost:3000', 'http://localhost:3000/'],
    ['localhost', 'http://localhost/'],
    ['acme.localhost:5173/pricing', 'http://acme.localhost:5173/pricing'],
    ['127.0.0.1:8080/x', 'http://127.0.0.1:8080/x'],
    ['192.168.1.20', 'http://192.168.1.20/'],
    ['  example.com  ', 'https://example.com/'],
    ['file:///Users/sam/site/index.html', 'file:///Users/sam/site/index.html'],
  ])('reads %s', (input, url) => {
    expect(parseAddress(input)).toEqual({ ok: true, kind: 'url', url });
  });

  it('reads project addresses', () => {
    expect(parseAddress('hatch:acme')).toEqual({ ok: true, kind: 'project', project: 'acme', path: '/' });
    expect(parseAddress('hatch:Acme/pricing/teams')).toEqual({ ok: true, kind: 'project', project: 'acme', path: '/pricing/teams' });
  });

  it.each(['', '   ', 'pricing page', 'javascript:alert(1)', 'chrome://settings', 'hatch:', 'hatch:bad_name', 'word'])('rejects %j', (input) => {
    expect(parseAddress(input).ok).toBe(false);
  });
});

describe('labelForUrl', () => {
  it('shortens a link for a tab', () => {
    expect(labelForUrl('https://example.com/')).toBe('example.com');
    expect(labelForUrl('http://localhost:3000/pricing')).toBe('localhost:3000/pricing');
    expect(labelForUrl('file:///Users/sam/site/index.html')).toBe('index.html');
  });
  it('opens a pasted absolute path as a file, spaces included', () => {
    expect(parseAddress('/Users/someone/My Site/index.html')).toEqual({ ok: true, kind: 'url', url: 'file:///Users/someone/My%20Site/index.html' });
  });
});
