// Spike 7: MCP SDK v2 inside the Electron main process.
// Question: how does Hatch tell one agent from another, for each protocol era,
// and does a Hatch restart break a connected agent?
import { createServer } from 'node:http';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';

// 1 x 1 transparent PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function factory(reqCtx) {
  const server = new McpServer({ name: 'hatch-spike', version: '0.0.0' });
  const headers = reqCtx.requestInfo?.headers;

  server.registerTool('probe', { description: 'Reports what the server can see about the caller.' }, async (ctx) => ({
    content: [{
      type: 'text',
      text: JSON.stringify({
        era: reqCtx.era,
        sessionId: ctx.sessionId ?? null,
        sessionHeader: headers?.get('mcp-session-id') ?? null,
        agentHeader: headers?.get('x-hatch-agent') ?? null,
        agentQuery: reqCtx.requestInfo?.url ? new URL(reqCtx.requestInfo.url, 'http://127.0.0.1').searchParams.get('agent') : null,
        requestInfoKeys: Object.keys(reqCtx.requestInfo ?? {}),
        envelope: ctx.mcpReq.envelope ?? null,
      }),
    }],
  }));

  server.registerTool('shot', { description: 'Slow tool with progress and an image result.', inputSchema: z.object({ steps: z.number().default(3) }) }, async ({ steps }, ctx) => {
    const progressToken = ctx.mcpReq._meta?.progressToken;
    for (let i = 1; i <= steps; i += 1) {
      await new Promise((r) => setTimeout(r, 60));
      if (progressToken !== undefined) {
        await ctx.mcpReq.notify({ method: 'notifications/progress', params: { progressToken, progress: i, total: steps, message: `step ${i}` } });
      }
    }
    return { content: [{ type: 'image', data: PNG, mimeType: 'image/png' }] };
  });

  return server;
}

function listen(port) {
  const handler = createMcpHandler(factory, { onerror: (e) => console.error('[handler]', e.message) });
  const node = toNodeHandler(handler);
  const hostOk = localhostHostValidation();
  const originOk = localhostOriginValidation();
  const http = createServer((req, res) => {
    if (!hostOk(req, res) || !originOk(req, res)) return;
    void node(req, res);
  });
  return new Promise((resolve) => {
    http.listen(port, '127.0.0.1', () => resolve({
      port: http.address().port,
      stop: async () => {
        await handler.close();
        http.closeAllConnections();
        await new Promise((r) => http.close(r));
      },
    }));
  });
}

async function connect(url, name, mode, agentHeader) {
  const client = new Client({ name, version: '1.0.0' }, mode ? { versionNegotiation: { mode } } : undefined);
  const requestInit = agentHeader ? { headers: { 'X-Hatch-Agent': agentHeader } } : undefined;
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit }));
  return client;
}

const probe = async (client) => JSON.parse((await client.callTool({ name: 'probe', arguments: {} })).content[0].text);

export async function mcp(record) {
  let server = await listen(0);
  const url = `http://127.0.0.1:${server.port}/mcp`;

  const modern = await connect(url, 'agent-modern', 'auto', 'shim-a');
  const legacy = await connect(url, 'agent-legacy', undefined, 'shim-b');
  record('current-protocol client connects', modern.getProtocolEra() === 'modern', { era: modern.getProtocolEra(), version: modern.getNegotiatedProtocolVersion() });
  record('previous-protocol client connects', legacy.getProtocolEra() === 'legacy', { era: legacy.getProtocolEra(), version: legacy.getNegotiatedProtocolVersion() });

  for (const [label, client] of [['current', modern], ['previous', legacy]]) {
    const seen = [];
    const result = await client.callTool({ name: 'shot', arguments: { steps: 3 } }, { onprogress: (p) => seen.push(p.progress) });
    const image = result.content[0];
    record(`${label}: image result arrives`, image?.type === 'image' && image.data === PNG, { type: image?.type });
    record(`${label}: progress notifications arrive`, seen.length === 3, { seen });
  }

  // What can the server use to tell agents apart?
  const twin = await connect(url, 'agent-modern', 'auto');
  const seenModern = await probe(modern);
  const seenTwin = await probe(twin);
  const seenLegacy = await probe(legacy);
  record('server view of the current-protocol client', true, seenModern);
  record('server view of the previous-protocol client', true, seenLegacy);
  record('no session id exists in either era under the SDK default', seenModern.sessionId === null && seenLegacy.sessionId === null, {});
  const strip = ({ agentHeader, agentQuery, ...rest }) => JSON.stringify(rest);
  record('two same-named agents look identical without a Hatch-issued header', strip(seenModern) === strip(seenTwin), {});
  record('the shim header separates them', seenModern.agentHeader === 'shim-a' && seenTwin.agentHeader === null, {});

  // Agents that connect over HTTP directly carry their name in the URL the connection kit hands out.
  for (const mode of ['auto', undefined]) {
    const named = await connect(`${url}?agent=cursor`, 'agent-named', mode);
    const seenNamed = await probe(named).catch((e) => ({ error: e.message }));
    record(`${mode ? 'current' : 'previous'}: the agent name in the URL reaches the tool`, seenNamed.agentQuery === 'cursor', seenNamed);
    await named.close().catch(() => {});
  }

  // Restart Hatch under connected clients.
  const { port } = server;
  await server.stop();
  server = await listen(port);
  await new Promise((r) => setTimeout(r, 300));
  for (const [label, client] of [['current', modern], ['previous', legacy]]) {
    const attempt = () => probe(client).catch((e) => ({ error: `${e.message}: ${e.cause?.code ?? e.cause?.message ?? ''}` }));
    const first = await attempt();
    const second = first.error ? await attempt() : null;
    const ok = !(second ?? first).error;
    record(`${label}: call succeeds after a server restart with no reconnect`, ok, { firstTry: first.error ?? 'ok', secondTry: second ? second.error ?? 'ok' : 'not needed' });
  }

  // Browser-origin request.
  const evil = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', origin: 'https://evil.example' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  record('request with a foreign Origin receives 403', evil.status === 403, { status: evil.status });

  await Promise.allSettled([modern.close(), legacy.close(), twin.close()]);
  await server.stop();
}
