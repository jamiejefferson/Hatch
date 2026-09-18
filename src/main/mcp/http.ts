// The loopback HTTP endpoint agents connect to.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { app } from 'electron';
import { dataFile } from '../paths';
import { createEndpoint, type McpEndpoint } from './server';

export const DEFAULT_PORT = 42824;
const FALLBACK_PORTS = 10;

/**
 * Pages inside Hatch are themselves localhost origins, so "allow localhost" would let a compromised dev dependency call Hatch's tools.
 * A browser always sends Origin or Sec-Fetch-Site on a cross-origin request, and an agent never does. Hatch rejects both headers outright.
 */
export function guard(headers: IncomingMessage['headers'], port: number): string | null {
  if (headers.origin !== undefined || headers['sec-fetch-site'] !== undefined) return 'Hatch accepts no requests from web pages.';
  const host = headers.host ?? '';
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return 'Hatch answers on 127.0.0.1 only.';
  return null;
}

let server: Server | null = null;
let endpoint: McpEndpoint | null = null;
const serverFile = (): string => dataFile('server.json');

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const s = createServer((req, res) => route(req, res, (s.address() as { port: number }).port));
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => {
      s.off('error', reject);
      resolve(s);
    });
  });
}

function route(req: IncomingMessage, res: ServerResponse, port: number): void {
  const refused = guard(req.headers, port);
  if (refused) {
    res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: refused }));
    return;
  }
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: 'hatch', version: app.getVersion(), pid: process.pid, mcp: `http://127.0.0.1:${port}/mcp` }));
    return;
  }
  if (path === '/mcp' && endpoint) return endpoint.handle(req, res);
  res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Hatch serves MCP at /mcp.' }));
}

export async function startMcp(): Promise<number> {
  endpoint = createEndpoint();
  const wanted = process.env.HATCH_MCP_PORT !== undefined ? Number(process.env.HATCH_MCP_PORT) : DEFAULT_PORT;
  let lastError: unknown;
  for (let i = 0; i <= (wanted === 0 ? 0 : FALLBACK_PORTS); i += 1) {
    try {
      server = await listen(wanted === 0 ? 0 : wanted + i);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!server) throw lastError;
  const { port } = server.address() as { port: number };
  await mkdir(dirname(serverFile()), { recursive: true });
  await writeFile(serverFile(), `${JSON.stringify({ port, pid: process.pid, version: app.getVersion(), url: `http://127.0.0.1:${port}/mcp` }, null, 2)}\n`);
  void writeManifest(port).catch((error) => console.error('[mcp] Hatch could not write tools.json:', error));
  return port;
}

/** The stdio shim reads tools.json to answer an agent while Hatch is closed. Hatch asks its own endpoint, so the file holds exactly what agents receive. */
async function writeManifest(port: number): Promise<void> {
  const answer = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', 'x-hatch-agent': 'hatch-manifest' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const text = await answer.text();
  const json = text.trimStart().startsWith('{') ? text : (text.split(/\r?\n/).find((l) => l.startsWith('data:'))?.slice(5) ?? '');
  const tools = (JSON.parse(json) as { result?: { tools?: unknown[] } }).result?.tools;
  if (!tools?.length) throw new Error(`no tools in ${text.slice(0, 200)}`);
  await writeFile(dataFile('tools.json'), `${JSON.stringify({ version: app.getVersion(), tools }, null, 2)}\n`);
}

export async function stopMcp(): Promise<void> {
  // Open agent streams close first, or the endpoint waits on them for as long as the agent stays connected.
  server?.closeAllConnections();
  await Promise.race([endpoint?.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
  server?.closeAllConnections();
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
  await rm(serverFile(), { force: true });
}

let startError: string | null = null;
/** Why Hatch has no agent port, in words for the interface. */
export const mcpError = (): string | null => startError;
export const noteMcpError = (error: unknown): void => void (startError = `Hatch could not open a port for agents between ${DEFAULT_PORT} and ${DEFAULT_PORT + FALLBACK_PORTS}. ${error instanceof Error ? error.message : ''}`.trim());

export const mcpPort = (): number | null => (server ? (server.address() as { port: number }).port : null);
