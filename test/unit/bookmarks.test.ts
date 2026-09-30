import { describe, expect, it } from 'vitest';
import { addImported, linksFromBookmarks } from '@shared/bookmarks';

const file = {
  roots: {
    bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [
      { type: 'url', name: 'Figma', url: 'https://figma.com/' },
      { type: 'url', name: 'Notes', url: 'chrome://settings' },
      { type: 'folder', name: 'Design', children: [
        { type: 'url', name: '', url: 'https://type.example/' },
        { type: 'folder', name: 'Colour', children: [{ type: 'url', name: 'Coolors', url: 'https://coolors.co/' }] },
      ] },
    ] },
    other: { type: 'folder', name: 'Other bookmarks', children: [{ type: 'url', name: 'Paper', url: 'https://paper.design/' }] },
    synced: { type: 'folder', name: 'Mobile bookmarks', children: [] },
  },
};

describe('linksFromBookmarks', () => {
  it('takes web addresses in order, under folders named after the browser', () => {
    expect(linksFromBookmarks(file, 'Chrome')).toEqual([
      { name: 'Figma', url: 'https://figma.com/', folder: 'Chrome' },
      { name: 'https://type.example/', url: 'https://type.example/', folder: 'Chrome / Design' },
      { name: 'Coolors', url: 'https://coolors.co/', folder: 'Chrome / Design / Colour' },
      { name: 'Paper', url: 'https://paper.design/', folder: 'Chrome / Other bookmarks' },
    ]);
  });

  it('returns nothing for a file with no roots', () => {
    expect(linksFromBookmarks(null, 'Chrome')).toEqual([]);
    expect(linksFromBookmarks({ version: 1 }, 'Chrome')).toEqual([]);
  });
});

describe('addImported', () => {
  it('skips an address Links holds, and a repeat inside the import', () => {
    const incoming = [
      { name: 'Figma', url: 'https://figma.com/', folder: 'Chrome' },
      { name: 'Paper', url: 'https://paper.design/', folder: 'Chrome' },
      { name: 'Paper again', url: 'https://paper.design/', folder: 'Chrome / Other bookmarks' },
    ];
    const result = addImported<{ url: string; folder?: string }>([{ url: 'https://figma.com/' }], incoming, (l) => ({ url: l.url, folder: l.folder }));
    expect(result).toEqual({ links: [{ url: 'https://figma.com/' }, { url: 'https://paper.design/', folder: 'Chrome' }], added: 1, skipped: 2 });
  });
});
