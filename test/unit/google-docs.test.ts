import { describe, expect, it } from 'vitest';
import { docExportUrl, googleDocId, tidyExport } from '@shared/google-docs';

const ID = '1S-FA2HkUYKMW3Qsk31nbnPAa6vw7cJBEkRHK9idSUxE';

describe('Google Docs addresses', () => {
  it('finds the document id in the addresses Google uses', () => {
    expect(googleDocId(`https://docs.google.com/document/d/${ID}/edit?tab=t.0#heading=h.y916grwmmqim`)).toBe(ID);
    expect(googleDocId(`https://docs.google.com/document/u/1/d/${ID}/edit`)).toBe(ID);
    expect(googleDocId(`https://docs.google.com/document/d/${ID}`)).toBe(ID);
  });

  it('leaves every other page alone', () => {
    for (const url of [`https://docs.google.com/spreadsheets/d/${ID}/edit`, `https://evil.example/document/d/${ID}/edit`, `http://docs.google.com/document/d/${ID}/edit`, 'https://docs.google.com/document/d/short/edit', 'not a link', 'about:blank']) {
      expect(googleDocId(url)).toBeNull();
    }
  });

  it('builds the export address, and lets a stand-in host through for tests', () => {
    expect(docExportUrl(`https://docs.google.com/document/d/${ID}/edit`, 'md')).toBe(`https://docs.google.com/document/d/${ID}/export?format=md`);
    expect(docExportUrl(`http://127.0.0.1:5000/document/d/${ID}/edit`, 'txt', ['127.0.0.1:5000'])).toBe(`http://127.0.0.1:5000/document/d/${ID}/export?format=txt`);
    expect(docExportUrl(`http://127.0.0.1:5000/document/d/${ID}/edit`, 'txt')).toBeNull();
  });

  it('tidies an export', () => {
    expect(tidyExport('﻿Title\r\n\r\n\r\n\r\nBody\r\n')).toBe('Title\n\nBody');
  });
});
