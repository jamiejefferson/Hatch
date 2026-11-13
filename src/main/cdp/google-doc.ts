// Reads a Google Doc's text for the agent. Docs draws the text on a canvas, so the agent view holds Google's menus alone.
// The export address answers to the sign-in the pages session holds, so the agent reads what the user can read and nothing more.
import { DOC_FORMATS, docExportUrl, googleDocId, tidyExport } from '@shared/google-docs';
import { saveResult } from '../results';
import type { PageSession } from './session';

/** `HATCH_GOOGLE_DOCS_HOSTS` names stand-in hosts for the tests, which cannot reach Google. */
const hosts = (): string[] => (process.env.HATCH_GOOGLE_DOCS_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);

const EXPORT_TIMEOUT_MS = 15_000;

type DocText = { text: string } | { problem: string };

/** Whether an address shows a Google Doc, stand-in hosts included. */
export const isGoogleDocUrl = (url: string): boolean => googleDocId(url, hosts()) !== null;

/** The document's text from Google's export, or why Google gave none. Markdown first, because it keeps headings and lists. */
async function fetchDocText(page: PageSession): Promise<DocText> {
  const url = page.guest.getURL();
  let problem = 'Google sent no text.';
  for (const format of DOC_FORMATS) {
    const address = docExportUrl(url, format, hosts())!;
    try {
      const res = await page.guest.session.fetch(address, { credentials: 'include', signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS) });
      const type = res.headers.get('content-type') ?? '';
      // A reader without access meets Google's sign-in page, which arrives as HTML in place of the document.
      if (res.status === 401 || res.status === 403 || (res.ok && type.includes('text/html'))) return { problem: 'Google refused to export it, because the account signed in to this Hatch cannot read the document.' };
      if (!res.ok) {
        problem = `Google answered the export with status ${res.status}.`;
        continue;
      }
      return { text: tidyExport(await res.text()) };
    } catch (err) {
      problem = `The export failed: ${err instanceof Error ? err.message : String(err)}.`;
    }
  }
  return { problem };
}

const NOTICE = 'This Hatch shows a Google Doc, which draws its text where the agent view cannot read it, so no script or scroll will reach the words.';

/**
 * The document's text for a reply, cut at `maxChars`; a longer document is saved whole and the reply names the file.
 * Answers null for a page that is no Google Doc.
 */
export async function docSection(page: PageSession, maxChars: number): Promise<string | null> {
  const id = googleDocId(page.guest.getURL(), hosts());
  if (!id) return null;
  const got = await fetchDocText(page);
  if ('problem' in got) return `${NOTICE} ${got.problem} A screenshot shows the part on screen.`;
  if (!got.text) return `${NOTICE} Google's export of it holds no text, so the document is empty.`;
  const head = `${NOTICE} Its text, from Google's export of the document (${got.text.length} characters):`;
  if (got.text.length <= maxChars) return `${head}\n\n${got.text}`;
  const file = await saveResult(got.text, 'md', 'google-doc', id);
  return `${head}\n\n${got.text.slice(0, maxChars)}\n\n… The text stopped at ${maxChars} characters. The whole document is saved at ${file}, so read that file for the rest.`;
}
