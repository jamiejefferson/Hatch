// Jev probe, step 1: saves agent views of real pages from the running Hatch.
// Usage: node spikes/jev-capture.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const out = join(dirname(fileURLToPath(import.meta.url)), 'results/jev');
mkdirSync(out, { recursive: true });
const PAGES = {
  books: 'https://books.toscrape.com/',
  mdn: 'https://developer.mozilla.org/en-US/docs/Web/CSS/grid',
  wikipedia: 'https://en.wikipedia.org/wiki/Web_browser',
  github: 'https://github.com/jamiejefferson/Hatch',
  govuk: 'https://www.gov.uk/browse/driving',
  hn: 'https://news.ycombinator.com/',
};

const { url } = JSON.parse(readFileSync(join(homedir(), '.hatch/server.json'), 'utf8'));
const agent = new Client({ name: 'jev-probe', version: '0.0.0' });
await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=jev-probe`)));
const call = async (name, args = {}) => {
  const r = await agent.callTool({ name, arguments: args });
  return r.content.map((c) => c.text ?? '').join('\n');
};

for (const [name, address] of Object.entries(PAGES)) {
  const opened = await call('open_hatch', { to: address });
  // The probe closes a Hatch only when Hatch confirms the probe opened it.
  const id = opened.match(/^Opened Hatch (hatch_[a-z0-9]+)/)?.[1];
  console.log(name, '->', opened.split('\n')[0]);
  if (!id) continue;
  await new Promise((r) => setTimeout(r, 4000));
  const view = await call('snapshot', { max_chars: 200000, hatch: id });
  writeFileSync(join(out, `${name}.txt`), view);
  console.log(`  ${view.length} chars, ${view.split('\n').length} lines`);
  await call('close_hatch', { hatch: id });
}
console.log(await call('finish_working', { summary: 'Saved agent views of six public pages for a speed test.' }));
await agent.close();
