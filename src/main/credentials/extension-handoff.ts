import type { IncomingMessage, ServerResponse } from 'node:http';
import { session, webContents } from 'electron';
import { inSite } from '@shared/cookie-import';
import { fromExtension, readHandoff } from '@shared/signin-handoff';
import { PAGES_PARTITION } from '../paths';
import { push } from '../renderer-rpc';

/** One site's cookies come to well under this. */
const BODY_LIMIT = 2 * 1024 * 1024;

const reply = (res: ServerResponse, status: number, body: object, origin?: string): void =>
  void res.writeHead(status, { 'content-type': 'application/json', ...(origin ? { 'access-control-allow-origin': origin } : {}) }).end(JSON.stringify(body));

/**
 * Answers Hatch's browser extension, which reads one site's cookies inside Chrome, Arc, Brave or Edge and sends them here.
 * The browser hands them over itself, so macOS never asks for the Keychain. Only the extension's own origin passes, and a web page cannot claim it.
 * A GET tells the extension it has found Hatch. A POST sets the cookies in the pages session and reloads every Hatch on that site.
 */
export function handleHandoff(req: IncomingMessage, res: ServerResponse, port: number): void {
  const origin = req.headers.origin;
  const host = req.headers.host ?? '';
  if (!fromExtension(origin) || (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)) return reply(res, 403, { error: "Hatch takes sign-ins from its own browser extension alone." });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': origin!, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' }).end();
    return;
  }
  if (req.method === 'GET') return reply(res, 200, { name: 'hatch' }, origin);
  if (req.method !== 'POST') return reply(res, 405, { error: 'Send the sign-in with POST.' }, origin);

  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > BODY_LIMIT) req.destroy();
    else chunks.push(chunk);
  });
  req.on('end', () => {
    let body: unknown = null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reply(res, 400, { error: 'Hatch could not read what the extension sent.' }, origin);
    }
    void accept(body).then(
      (outcome) => reply(res, outcome.ok ? 200 : 400, outcome, origin),
      (error: unknown) => reply(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Hatch could not take the sign-in.' }, origin),
    );
  });
}

async function accept(body: unknown): Promise<{ ok: true; site: string; count: number; reloaded: number } | { ok: false; error: string }> {
  const handoff = readHandoff(body);
  if (!handoff.ok) return handoff;
  const jar = session.fromPartition(PAGES_PARTITION).cookies;
  let count = 0;
  for (const details of handoff.cookies) await jar.set(details).then(() => count++, () => {});
  if (count === 0) return { ok: false, error: `Hatch could not set the cookies for ${handoff.site}.` };
  await jar.flushStore();
  // Every Hatch on the site opens again, now signed in. webContents.reload() reloads the page alone, never Hatch's window.
  const onSite = webContents.getAllWebContents().filter((wc) => wc.getType() === 'webview' && URL.canParse(wc.getURL()) && inSite(new URL(wc.getURL()).hostname, handoff.site));
  for (const wc of onSite) wc.reload();
  push('signin:arrived', { site: handoff.site });
  push('toast', `Hatch brought your sign-in for ${handoff.site} from ${handoff.browser}${onSite.length ? ' and opened its pages again' : ''}.`);
  return { ok: true, site: handoff.site, count, reloaded: onSite.length };
}
