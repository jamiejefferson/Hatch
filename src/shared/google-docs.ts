// Google Docs draws a document's text on a canvas, so the agent view holds its menus and none of its words.
// Google serves the same document as text at an export address, which answers to the reader's own sign-in. Pure functions, unit tested.

const DOCS_HOST = 'docs.google.com';

/** The formats Hatch asks for, best first: Markdown keeps headings and lists, and plain text is the fallback. */
export const DOC_FORMATS = ['md', 'txt'] as const;

/**
 * The document id of a Google Doc's address, or null for any other page.
 * Addresses read /document/d/<id>/... or /document/u/<n>/d/<id>/...; `hosts` adds stand-in hosts for the tests.
 */
export function googleDocId(url: string, hosts: string[] = []): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && !hosts.includes(u.host)) return null;
  if (u.host !== DOCS_HOST && !hosts.includes(u.host)) return null;
  const m = /^\/document(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/.exec(u.pathname);
  return m ? m[1]! : null;
}

/** The address that serves the document's text in one format, on the host the page came from. */
export function docExportUrl(url: string, format: (typeof DOC_FORMATS)[number], hosts: string[] = []): string | null {
  const id = googleDocId(url, hosts);
  if (!id) return null;
  const u = new URL(url);
  return `${u.protocol}//${u.host}/document/d/${id}/export?format=${format}`;
}

/** Strips what an export adds and an agent has no use for: a byte-order mark, Windows line ends and runs of blank lines. */
export function tidyExport(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
