// Checks on the app itself what no Playwright test can: a test's debugger keeps the window drawing.
// Hatch starts with its window shown, macOS hides it as Cmd+H does, and an agent resizes the Hatch and takes a screenshot meanwhile.
// The page must take its new size while hidden, and the screenshot must come back within three seconds.
// Run after `pnpm build` with `node spikes/hidden-window.mjs`. It hides the app called "Electron" for a few seconds.
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const site = createServer((_q, s) => s.end(readFileSync('test/fixtures/site/index.html'))).listen(0, '127.0.0.1');
const home = mkdtempSync(join(tmpdir(), 'hatch-hidden-'));
writeFileSync(join(home, 'settings.json'), JSON.stringify({ allowEvaluate: true }));
const electron = (await import('electron')).default;
const child = spawn(electron, ['.'], { env: { ...process.env, HATCH_HOME: home, HATCH_MCP_PORT: '0', HATCH_PROXY_PORT: '0', HATCH_GUIDE: '0', HATCH_WELCOME: '0' }, stdio: 'ignore' });
const visible = (on) => execSync(`osascript -e 'tell application "System Events" to set visible of process "Electron" to ${on}'`);
let failed = false;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}: ${detail}`);
  if (!ok) failed = true;
};
try {
  for (let i = 0; i < 60 && !existsSync(join(home, 'server.json')); i++) await wait(500);
  await wait(2000);
  const { url } = JSON.parse(readFileSync(join(home, 'server.json'), 'utf8'));
  const agent = new Client({ name: 'probe', version: '1' });
  await agent.connect(new StreamableHTTPClientTransport(new URL(`${url}?agent=probe`)));
  const call = async (name, args = {}) => {
    const started = Date.now();
    const r = await agent.callTool({ name, arguments: args });
    return { ms: Date.now() - started, error: !!r.isError, text: r.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ') };
  };
  await call('navigate', { to: `http://127.0.0.1:${site.address().port}/` });
  visible(false);
  await wait(4000);
  await call('set_viewport', { width: 700, height: 600 });
  const size = await call('evaluate', { expression: '`${innerWidth}x${innerHeight}`' });
  check('resize while hidden', size.text.includes('700x600'), size.text);
  const shot = await call('screenshot', { max_width: 400 });
  check('screenshot while hidden', !shot.error && shot.ms < 3000, `${shot.ms} ms, ${shot.text.slice(0, 80)}`);
  await agent.close();
} finally {
  visible(true);
  child.kill('SIGINT');
  site.close();
}
process.exit(failed ? 1 : 0);
