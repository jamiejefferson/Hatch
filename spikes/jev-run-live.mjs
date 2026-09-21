// Live probe for jev_run: starts a Hatch binary against a throwaway data folder that holds a copy of the user's
// Jev key file, then runs goals on public pages through the real TypeSafe service. Usage:
//   node spikes/jev-run-live.mjs <path to the Hatch binary>
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const binary = process.argv[2];
const home = mkdtempSync(join(tmpdir(), 'hatch-live-'));
copyFileSync(join(homedir(), '.hatch', 'jev.json'), join(home, 'jev.json'));
writeFileSync(join(home, 'workspace.json'), '{}');
const app = spawn(binary, [], { env: { ...process.env, HATCH_HOME: home, HATCH_MCP_PORT: '0', HATCH_PROXY_PORT: '0', HATCH_HIDDEN: '1', HATCH_GUIDE: '0', HATCH_WELCOME: '0' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60 && !existsSync(join(home, 'server.json')); i += 1) await sleep(500);
const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
const agent = new Client({ name: 'live-probe', version: '1.0.0' });
await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=live-probe`)));
const call = async (name, args = {}) => (await agent.callTool({ name, arguments: args }, undefined, { timeout: 240_000 })).content.at(-1).text;

const RUNS = [
  ['https://books.toscrape.com/', 'open the Travel category, then open the first book in the list'],
  ['https://www.gov.uk/', 'refuse the additional cookies, search for "blue badge" and open the result about applying for or renewing a Blue Badge'],
  ['https://en.wikipedia.org/wiki/Main_Page', 'search for "Ada Lovelace" and open her article'],
  ['https://news.ycombinator.com/', 'open the page that lists the newest submissions, then go to its second page'],
];
try {
  for (const [to, goal] of RUNS) {
    console.log(`\n=== ${to}\n    ${goal}`);
    console.log((await call('navigate', { to })).split('\n')[0]);
    const text = await call('jev_run', { goal, max_steps: 15, max_seconds: 120 });
    console.log(text.slice(0, text.indexOf('final_snapshot')));
    console.log(text.slice(text.indexOf('final_snapshot')).split('\n').slice(0, 6).join('\n'));
  }
} finally {
  app.kill();
}
