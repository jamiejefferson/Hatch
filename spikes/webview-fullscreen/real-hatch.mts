// Run: npx tsx spikes/webview-fullscreen/real-hatch.mts after pnpm build. Esc stays out: a synthetic Esc freezes Electron 44's main process in full screen.
// Runs the built Hatch on its own, with no Playwright attached, and drives a page's full-screen button through the agent tools.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const page = readFileSync(resolve('test/fixtures/site/video.html'));
const site = createServer((_q, r) => r.writeHead(200, { 'content-type': 'text/html' }).end(page)).listen(0, '127.0.0.1');
await new Promise((r) => site.once('listening', r));
const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/video.html`;
const home = mkdtempSync(join(tmpdir(), 'hatch-fs-'));
writeFileSync(join(home, 'settings.json'), JSON.stringify({ allowEvaluate: true, guideSeen: true, jevRunSeen: true }));
const electron = resolve('node_modules/.bin/electron');
const hatch = spawn(electron, ['.'], { env: { ...process.env, HATCH_HOME: home, HATCH_MCP_PORT: '0', HATCH_PROXY_PORT: '0', HATCH_GUIDE: '0', HATCH_WELCOME: '0' }, stdio: 'ignore' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
while (!existsSync(join(home, 'server.json'))) await wait(200);
const server = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
const client = new Client({ name: 'fs-probe', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}?agent=fs-probe`)));
const call = async (name: string, args: Record<string, unknown>) => ((await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[] }).content.map((c) => c.text).join('\n');
const state = async (label: string) => console.log(label, '→', (await call('evaluate', { expression: "(document.fullscreenElement?.id ?? 'none') + ' ' + innerWidth + 'x' + innerHeight" })).split('\n')[0]);
try {
  const opened = await call('open_hatch', { to: url });
  const ref = opened.split('\n').find((l) => l.includes('Full screen'))?.match(/\[(e\d+)\]/)?.[1];
  await wait(1000);
  await state('before');
  for (const exit of ['page', 'page']) {
    await call('click', { ref });
    await wait(2000);
    await state('after click');
    await call('evaluate', { expression: 'document.exitFullscreen(), 1' });
    await wait(2000);
    await state(`after ${exit} exit`);
  }
} finally {
  hatch.kill();
  site.close();
  process.exit(0);
}
