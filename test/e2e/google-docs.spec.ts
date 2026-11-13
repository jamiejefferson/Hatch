// A Google Doc draws its words on a canvas, so Hatch reads them from Google's export with the page's own sign-in.
// get_context reads a link to one Hatch or to a canvas as well as context and group links.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect, test } from '@playwright/test';
import { DOCS, freshHome, launch, serveSite } from './helpers';

test('an agent reads a Google Doc whole, and get_context reads a Hatch link and a canvas link', async () => {
  const site = await serveSite();
  const home = freshHome();
  const { app } = await launch(home, 0, { HATCH_GOOGLE_DOCS_HOSTS: new URL(site.url).host });
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'docs', version: '1.0.0' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=docs`)));
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<{ text: string; isError: boolean }> => {
    const r = (await agent.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content.map((c) => c.text).filter(Boolean).join('\n'), isError: r.isError === true };
  };
  const docAt = (id: string): string => `${site.url}/document/d/${id}/edit`;

  try {
    // The arrival carries the document's words, which the outline alone never holds, in Markdown.
    const opened = await call('open_hatch', { to: docAt(DOCS.plain) });
    expect(opened.isError, opened.text).toBe(false);
    expect(opened.text).toContain("Its text, from Google's export of the document");
    expect(opened.text).toContain('## What went wrong');
    expect(opened.text).toContain('- Every sentence had three parts.');
    const hatchId = /Opened Hatch (hatch_\w+)/.exec(opened.text)![1]!;

    // snapshot leads with the text and keeps Google's controls after it.
    const snap = await call('snapshot');
    expect(snap.text.indexOf('I read an article written by an LLM')).toBeLessThan(snap.text.indexOf('button "Share"'));
    expect(snap.text).toContain('button "Share"');
    // One branch of the outline stays a plain outline.
    const share = /\[(e\d+)\][^\n]*"Share"|button "Share"[^\n]*\[(e\d+)\]/.exec(snap.text)!;
    const branch = await call('snapshot', { root_ref: share[1] ?? share[2] });
    expect(branch.text).not.toContain('Google Doc');

    // Where Google offers no Markdown, plain text stands in, tidied.
    const plain = await call('navigate', { to: docAt(DOCS.textOnly) });
    expect(plain.text).toContain('The Slop of the New\n\nPlain text only.');

    // A document the signed-in account cannot read says so, with no guessing.
    const refused = await call('navigate', { to: docAt(DOCS.private) });
    expect(refused.isError).toBe(false);
    expect(refused.text).toContain('cannot read the document');

    // A long document arrives in part and lands whole in a file.
    const long = await call('navigate', { to: docAt(DOCS.long) });
    const file = /saved at (\S+\.md)/.exec(long.text)?.[1];
    expect(file, long.text).toBeTruthy();
    expect(existsSync(file!)).toBe(true);
    expect(readFileSync(file!, 'utf8')).toContain('The last line of the long draft.');
    const longSnap = await call('snapshot', { max_chars: 100000 });
    expect(longSnap.text).toContain('The last line of the long draft.');

    // A link to the Hatch reads as that Hatch, and names the Doc's way in.
    await call('navigate', { to: docAt(DOCS.plain), hatch: hatchId });
    const one = await call('get_context', { link: `hatch:@${hatchId}` });
    expect(one.isError, one.text).toBe(false);
    expect(one.text).toContain('A Hatch on the canvas');
    expect(one.text).toContain(`Hatch ${hatchId}`);
    expect(one.text).toContain('A Google Doc: snapshot with this hatch reads its whole text.');

    // A canvas link reads every Hatch on it.
    await call('open_hatch', { to: `${site.url}/docs.html` });
    const tabId = /tab_\w+/.exec((await call('status')).text)![0];
    const whole = await call('get_context', { link: `hatch:@${tabId}` });
    expect(whole.text).toContain('The whole of the canvas');
    expect(whole.text).toContain(hatchId);
    expect(whole.text).toContain('/docs.html');

    const gone = await call('get_context', { link: 'hatch:@hatch_nothere' });
    expect(gone.isError).toBe(true);
    expect(gone.text).toContain('No open canvas holds a Hatch or a canvas with that id');
    expect(gone.text).not.toContain('unexpected');
  } finally {
    await agent.close();
    await app.close();
    await site.close();
  }
});
