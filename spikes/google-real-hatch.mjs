// Throwaway probe: starts Hatch with spikes/google-hook.cjs and asks it, as an agent would, to open Google's sign-in page.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const home = mkdtempSync(join(tmpdir(), 'hatch-google-'));
const out = join(home, 'probe.json');
const electron = (await import('electron')).default;
const child = spawn(electron, ['spikes/google-main.mjs'], { env: { ...process.env, PROBE_OUT: out, HATCH_HOME: home, HATCH_MCP_PORT: '0', HATCH_PROXY_PORT: '0', HATCH_GUIDE: '0', HATCH_WELCOME: '0' }, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 60 && !existsSync(join(home, 'server.json')); i++) await wait(500);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'probe', version: '1' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=probe`)));
  await agent.callTool({ name: 'navigate', arguments: { to: 'https://accounts.google.com/ServiceLogin?hl=en' } });
  for (let i = 0; i < 60 && !existsSync(out); i++) await wait(500);
  console.log(existsSync(out) ? readFileSync(out, 'utf8') : 'NO RESULT');
  await agent.close();
} finally {
  child.kill();
}
