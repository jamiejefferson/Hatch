import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { hatchAddress, nameFromFolder, projectUrl } from '@shared/project-address';
import { commandWithPort, detect } from '../../src/main/servers/frameworks';
import { parseCwds, parseListeners } from '../../src/main/servers/lsof';

vi.mock('electron', () => ({ app: { getVersion: () => '0.0.0' }, ipcMain: { on: () => {}, handle: () => {} } }));
const { confine } = await import('../../src/main/servers/proxy');

describe('lsof parsing', () => {
  it('reads each listening socket once per process', () => {
    const out = ['p412', 'cnode', 'n*:5173', 'n[::1]:5173', 'p977', 'cControlCe', 'n127.0.0.1:7000', ''].join('\n');
    expect(parseListeners(out)).toEqual([
      { pid: 412, command: 'node', port: 5173, host: '*' },
      { pid: 977, command: 'ControlCe', port: 7000, host: '127.0.0.1' },
    ]);
  });
  it('maps a process to its working directory', () => {
    expect(parseCwds('p412\nfcwd\nn/Users/someone/site\n').get(412)).toBe('/Users/someone/site');
  });
});

describe('dev commands', () => {
  it('adds the port flag after -- for an npm script', () => {
    expect(commandWithPort('npm run dev', 'Vite', 4300)).toBe('npm run dev -- --port 4300 --strictPort');
  });
  it('adds the port flag directly for pnpm', () => {
    expect(commandWithPort('pnpm dev', 'Next.js', 4301)).toBe('pnpm dev --port 4301');
  });
  it('leaves a command that already names a port', () => {
    expect(commandWithPort('vite --port 3000', 'Vite', 4300)).toBe('vite --port 3000');
  });
  it('leaves a plain Node server to read PORT', () => {
    expect(commandWithPort('npm start', 'Node', 4300)).toBe('npm start');
  });
});

describe('project detection', () => {
  it('reads the framework and package manager', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hatch-detect-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'astro dev' }, dependencies: { astro: '5', vite: '7' } }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(await detect(dir)).toEqual({ kind: 'server', framework: 'Astro', command: 'pnpm dev' });
  });
  it('treats a folder with no dev command as static files', async () => {
    expect(await detect(mkdtempSync(join(tmpdir(), 'hatch-detect-')))).toEqual({ kind: 'folder', framework: 'folder', command: '' });
  });
});

describe('static file confinement', () => {
  it('resolves a path inside the folder', () => {
    expect(confine('/site', '/pages/about.html')).toBe('/site/pages/about.html');
  });
  it('refuses a path that climbs out', () => {
    expect(confine('/site', '/../etc/passwd')).toBeNull();
    expect(confine('/site', '/%2e%2e/etc/passwd')).toBeNull();
  });
  it('refuses dotfiles', () => {
    expect(confine('/site', '/.env')).toBeNull();
    expect(confine('/site', '/.git/config')).toBeNull();
  });
});

describe('project addresses', () => {
  const projects = [
    { name: 'acme', port: 4300, direct: false, kind: 'server' as const, livePort: 4300 },
    { name: 'login', port: 4301, direct: true, kind: 'server' as const, livePort: 4301 },
  ];
  it('names a folder', () => {
    expect(nameFromFolder('/Users/someone/Sites/Acme Site 2')).toBe('acme-site-2');
    expect(nameFromFolder('/Users/someone/mock.html')).toBe('mock');
  });
  it('builds the link a Hatch loads', () => {
    expect(projectUrl(projects[0]!, 4282, 'pricing')).toBe('http://acme.localhost:4282/pricing');
    expect(projectUrl(projects[1]!, 4282)).toBe('http://localhost:4301/');
  });
  it('shows a project link in its hatch: form', () => {
    expect(hatchAddress('http://acme.localhost:4282/pricing?x=1', projects, 4282)).toBe('hatch:acme/pricing?x=1');
    expect(hatchAddress('http://localhost:4301/', projects, 4282)).toBe('hatch:login');
    expect(hatchAddress('https://example.com/', projects, 4282)).toBeNull();
  });
});
