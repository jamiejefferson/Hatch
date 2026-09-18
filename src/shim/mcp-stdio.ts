// The stdio door into Hatch, for agent apps that start an MCP server as a command.
// It passes each JSON-RPC message to Hatch's local HTTP endpoint and writes the answers back.
// It also answers on its own while Hatch is closed, so an agent session that starts before Hatch keeps its tools.
// This file imports nothing from Electron or the MCP SDK, so plain Node runs it, and so does Hatch's own binary with ELECTRON_RUN_AS_NODE=1.
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

interface Message { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }

const home = process.env.HATCH_HOME || join(homedir(), '.hatch');
// One shim process counts as one agent. HATCH_AGENT gives it a readable name in Hatch's Activity panel.
const agent = (process.env.HATCH_AGENT || `stdio-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`).toLowerCase();
const LEGACY = '2025-11-25';
const CLOSED = 'Hatch is not running. Open the Hatch app, then call this tool again.';
let protocol: string | null = null;
// True once the shim has handed out the one-tool list, which happens on a Mac where Hatch has never run.
let listedAlone = false;

const readJson = <T>(name: string): T | null => {
  try {
    return JSON.parse(readFileSync(join(home, name), 'utf8')) as T;
  } catch {
    return null;
  }
};

const write = (message: Message): void => void process.stdout.write(`${JSON.stringify(message)}\n`);

/** Sends one message to Hatch. Resolves false when Hatch does not answer, which means it is closed. */
function forward(message: Message): Promise<boolean> {
  const server = readJson<{ url: string }>('server.json');
  if (!server?.url) return Promise.resolve(false);
  const body = JSON.stringify(message);
  return new Promise((resolve) => {
    const req = request(
      server.url,
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'content-length': Buffer.byteLength(body), 'x-hatch-agent': agent, ...(protocol ? { 'mcp-protocol-version': protocol } : {}) } },
      (res) => {
        res.setEncoding('utf8');
        const stream = String(res.headers['content-type'] ?? '').includes('text/event-stream');
        let buffer = '';
        const emit = (text: string): void => {
          try {
            const parsed = JSON.parse(text) as Message | Message[];
            for (const m of Array.isArray(parsed) ? parsed : [parsed]) {
              const version = (m.result as { protocolVersion?: string } | undefined)?.protocolVersion;
              if (message.method === 'initialize' && version) protocol = version;
              write(m);
            }
          } catch {
            // A line that holds no JSON carries nothing for the agent.
          }
        };
        res.on('data', (chunk: string) => {
          buffer += chunk;
          if (!stream) return;
          // Server-sent events: each event ends with a blank line, and its data lines hold one JSON-RPC message.
          let end: number;
          while ((end = buffer.search(/\r?\n\r?\n/)) !== -1) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '');
            const data = event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
            if (data) emit(data);
          }
        });
        res.on('end', () => {
          if (!stream && buffer.trim()) emit(buffer);
          if (res.statusCode && res.statusCode >= 400 && message.id !== undefined && !buffer.includes('"jsonrpc"')) {
            write({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: `Hatch answered ${res.statusCode}. ${buffer.slice(0, 200)}` } });
          }
          resolve(true);
        });
      },
    );
    req.once('error', () => resolve(false));
    req.end(body);
  });
}

/** What the shim says while Hatch is closed. Hatch writes tools.json each time it starts. */
function answerAlone(message: Message): void {
  if (message.id === undefined || message.id === null) return;
  const reply = (result: unknown): void => write({ jsonrpc: '2.0', id: message.id, result });
  switch (message.method) {
    case 'initialize': {
      const wanted = String(message.params?.protocolVersion ?? LEGACY);
      protocol = wanted;
      return reply({ protocolVersion: wanted, capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'hatch', version: readJson<{ version: string }>('tools.json')?.version ?? '0.0.0' }, instructions: 'Hatch is closed at the moment. Ask the user to open the Hatch app. Every tool works once it runs.' });
    }
    case 'ping':
      return reply({});
    case 'tools/list': {
      const saved = readJson<{ tools: unknown[] }>('tools.json')?.tools;
      listedAlone = !saved;
      return reply({ tools: saved ?? [{ name: 'status', description: 'Reports whether Hatch is running. Open the Hatch app to get the full tool list.', inputSchema: { type: 'object', properties: {} } }] });
    }
    case 'tools/call':
      return reply({ content: [{ type: 'text', text: CLOSED }], isError: true });
    default:
      return write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `${CLOSED} (${message.method})` } });
  }
}

let open = 0;
let ended = false;
const settle = (): void => {
  open -= 1;
  if (ended && open === 0) process.exit(0);
};

createInterface({ input: process.stdin })
  .on('line', (line) => {
    if (!line.trim()) return;
    let message: Message;
    try {
      message = JSON.parse(line) as Message;
    } catch {
      return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'The shim could not parse that line as JSON.' } });
    }
    open += 1;
    void forward(message)
      .then((reached) => {
        if (!reached) return answerAlone(message);
        // Hatch has opened since the agent received the one-tool list, so the agent asks for the full one.
        if (listedAlone) {
          listedAlone = false;
          write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        }
      })
      .finally(settle);
  })
  .on('close', () => {
    ended = true;
    if (open === 0) process.exit(0);
  });
