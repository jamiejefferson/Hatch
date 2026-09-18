// Every project answers at <name>.localhost, so each one has its own origin: cookies, storage and service workers stop colliding.
// The same address opens in any browser on the machine, and hot-reload sockets pass through.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { dirname, extname, join, normalize, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { PROXY_PORT } from '@shared/project-address';
import type { ProjectState } from '@shared/types';
import { hostFor, projectsState, setProxyPort } from './manager';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.wasm': 'application/wasm', '.map': 'application/json',
};

// A waiting page asks quietly whether the server answers yet, and reloads only once it does. A timed refresh would
// fire while the page is on its way somewhere else and drag a navigating Hatch back here.
const WAIT = `<script>setInterval(async () => { try { const r = await fetch(location.href, { method: 'HEAD', cache: 'no-store' }); if (r.status !== 503 && r.status !== 502) location.reload(); } catch {} }, 1500);</script>`;

const page = (title: string, body: string, refresh = false): string =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title>${refresh ? WAIT : ''}` +
  `<body style="margin:0;display:grid;place-items:center;min-height:100vh;font:15px/22px system-ui,sans-serif;color:#111;background:#fff">` +
  `<main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:20px;line-height:26px;margin:0 0 8px">${title}</h1><p style="margin:0;color:#666">${body}</p></main>`;

const send = (res: ServerResponse, status: number, html: string): void => void res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);

async function projectFor(req: IncomingMessage): Promise<ProjectState | null> {
  const host = (req.headers.host ?? '').split(':')[0]!.toLowerCase();
  if (!host.endsWith('.localhost')) return null;
  const name = host.slice(0, -'.localhost'.length);
  return (await projectsState(false)).projects.find((p) => p.name === name) ?? null;
}

/** Resolves a request path inside a folder. Returns null for anything outside it and for dotfiles. */
export function confine(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes(String.fromCharCode(0)) || decoded.split('/').some((part) => part.startsWith('.'))) return null;
  const full = normalize(join(root, decoded));
  return full === root || full.startsWith(root + sep) ? full : null;
}

async function serveStatic(project: ProjectState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const root = project.kind === 'file' ? dirname(project.folder) : project.folder;
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  let file = project.kind === 'file' && path === '/' ? project.folder : confine(root, path);
  if (file && (await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
  const info = file ? await stat(file).catch(() => null) : null;
  if (!file || !info?.isFile()) return send(res, 404, page('Nothing here', `${project.name} has no file at ${path.replace(/[<>&]/g, '')}.`));
  res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': 'no-store' });
  if (req.method === 'HEAD') return void res.end();
  createReadStream(file).pipe(res);
}

async function forward(project: ProjectState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const port = project.livePort;
  const host = port ? await hostFor(port) : null;
  if (!port || !host) {
    const starting = project.status === 'starting';
    const title = starting ? `Starting ${project.name}` : `${project.name} is not running`;
    const body = starting
      ? 'Hatch is running the dev command and waiting for the port to open. This page loads as soon as the server answers.'
      : 'Start it from the Projects panel in Hatch. This page loads as soon as the server answers.';
    return send(res, 503, page(title, body, true));
  }
  // The Host header stays as the browser sent it. Vite and Next.js accept .localhost names by default.
  const upstream = request({ host, port, method: req.method, path: req.url, headers: req.headers }, (answer) => {
    res.writeHead(answer.statusCode ?? 502, answer.headers);
    answer.pipe(res);
  });
  upstream.once('error', () => !res.headersSent && send(res, 502, page(`${project.name} did not answer`, 'The dev server closed the connection. Its log in Hatch may say why.', true)));
  req.pipe(upstream);
}

async function upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const project = await projectFor(req);
  const port = project?.livePort;
  const host = port ? await hostFor(port) : null;
  if (!port || !host) return void socket.destroy();
  const upstream = connect({ host, port }, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length) upstream.write(head);
    upstream.pipe(socket).pipe(upstream);
  });
  upstream.once('error', () => socket.destroy());
  socket.once('error', () => upstream.destroy());
}

const servers: Server[] = [];

export async function startProxy(): Promise<number> {
  const wanted = process.env.HATCH_PROXY_PORT !== undefined ? Number(process.env.HATCH_PROXY_PORT) : PROXY_PORT;
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
    void (async () => {
      const project = await projectFor(req);
      if (!project) return send(res, 404, page('No project answers here', 'Hatch knows no project by this name. The Projects panel lists the registered ones.'));
      return project.kind === 'server' ? forward(project, req, res) : serveStatic(project, req, res);
    })().catch(() => !res.headersSent && send(res, 500, page('Hatch hit an error', 'Try the page again.')));
  };
  const listen = (host: string, port: number): Promise<Server> =>
    new Promise((resolve, reject) => {
      const s = createServer(handler);
      s.on('upgrade', (req, socket, head) => void upgrade(req, socket, head));
      s.once('error', reject);
      s.listen(port, host, () => resolve(s));
    });
  const first = await listen('127.0.0.1', wanted);
  const { port } = first.address() as { port: number };
  servers.push(first);
  // Some browsers resolve .localhost names to the IPv6 loopback first.
  await listen('::1', port).then((s) => servers.push(s), () => {});
  setProxyPort(port);
  return port;
}

export function stopProxy(): void {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    s.close();
  }
  setProxyPort(null);
}
