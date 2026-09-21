// The only file that imports the MCP SDK, so an SDK change touches one place.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { app } from 'electron';
import { z } from 'zod';
import { begin, end } from '../agents/activity';
import { agentFor, callEnded, callStarted, identify, type Agent } from '../agents/agents';
import { HatchError } from '../cdp/session';
import { canAsk } from '../jev/client';
import { BRIEFING_HEAD, briefing } from './guide/brief';
import { TOOLS } from './tools';
import type { Tool, ToolContext } from './tools/types';

const INSTRUCTIONS = briefing('unknown');
/** An agent silent for this long has most likely started a new conversation, which has never seen the briefing. */
const BRIEF_AGAIN_MS = 5 * 60_000;

async function runTool(tool: Tool, args: Record<string, unknown>, agent: Agent, progress: (message: string) => void) {
  const intent = typeof args.intent === 'string' ? args.intent : '';
  const entry = begin({ agent: agent.id, tool: tool.name, summary: tool.summary ? tool.summary(args) : tool.name, intent, tabId: agent.tabId, hatchId: agent.hatchId });
  const where: { tabId: string | null; hatchId: string | null } = { tabId: agent.tabId, hatchId: agent.hatchId };
  const ctx: ToolContext = { agent, progress, at: (tabId, hatchId) => Object.assign(where, { tabId, hatchId }) };
  // The first call of a piece of work carries the briefing, whichever tool it is, so an agent app that hides the server's instructions still briefs its model.
  const brief = agent.finished || Date.now() - agent.lastCall > BRIEF_AGAIN_MS;
  callStarted(agent, intent);
  try {
    const result = await tool.run(args, ctx);
    const said = typeof result === 'string' ? result : result.text;
    const text = brief && tool.name !== 'finish_working' ? `${said}\n\n${BRIEFING_HEAD}\n${briefing((await canAsk()) ? 'on' : 'off')}` : said;
    end(entry, { ...where, note: said.split('\n')[0]?.slice(0, 200), detail: typeof result === 'string' ? undefined : result.activity });
    const content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[] = [];
    // Some agent apps drop image content, so the text always carries the saved file's path as well.
    if (typeof result !== 'string' && result.image) content.push({ type: 'image', data: result.image.base64, mimeType: result.image.mimeType });
    content.push({ type: 'text', text });
    return { content };
  } catch (error) {
    const message = error instanceof HatchError ? error.message : `Hatch hit an unexpected error in ${tool.name}: ${error instanceof Error ? error.message : String(error)}`;
    end(entry, { ...where, error: message });
    return { content: [{ type: 'text' as const, text: message }], isError: true };
  } finally {
    callEnded(agent);
  }
}

function buildServer(agentId: string): McpServer {
  const server = new McpServer({ name: 'hatch', title: 'Hatch', version: app.getVersion() }, { instructions: INSTRUCTIONS });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, // Strict, so an argument a tool cannot use is refused. A dropped argument gives a plausible answer to a question nobody asked.
        inputSchema: z.object(tool.shape).strict(), annotations: { readOnlyHint: !!tool.readOnly, openWorldHint: true } },
      async (args, ctx) => {
        const token = ctx.mcpReq._meta?.progressToken;
        let step = 0;
        const progress = (message: string): void => {
          if (token === undefined) return;
          step += 1;
          void ctx.mcpReq.notify({ method: 'notifications/progress', params: { progressToken: token, progress: step, message } }).catch(() => {});
        };
        return runTool(tool, args as Record<string, unknown>, agentFor(agentId), progress);
      },
    );
  }
  return server;
}

export interface McpEndpoint {
  handle(req: IncomingMessage, res: ServerResponse): void;
  close(): Promise<void>;
}

/** The SDK builds one server per request and keeps no sessions, so a Hatch restart leaves nothing stale for a connected agent. */
export function createEndpoint(): McpEndpoint {
  const handler = createMcpHandler((request) => buildServer(identify(request.requestInfo)), { onerror: (e) => console.error('[mcp]', e.message) });
  const node = toNodeHandler(handler);
  return { handle: (req, res) => void node(req, res), close: () => handler.close() };
}
