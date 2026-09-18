import { z } from 'zod';
import type { Agent } from '../../agents/agents';

export type ToolResult = string | { text: string; image?: { base64: string; mimeType: string }; tabId?: string | null; hatchId?: string | null };

export interface ToolContext {
  agent: Agent;
  /** Sends an MCP progress notification, which stops clients that honour them from timing out during a long wait. */
  progress(message: string): void;
  /** Lets a tool record where it ended up, for the Activity panel. */
  at(tabId: string | null, hatchId: string | null): void;
}

export interface Tool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  shape: S;
  readOnly?: boolean;
  /** The call in a few words for the Activity panel, such as `fill e9`. */
  summary?(args: z.infer<z.ZodObject<S>>): string;
  run(args: z.infer<z.ZodObject<S>>, ctx: ToolContext): Promise<ToolResult>;
}

export const tool = <S extends z.ZodRawShape>(t: Tool<S>): Tool => t as unknown as Tool;

// Schemas stay flat, so every client can render them.
export const intent = z.string().max(300).optional().describe('One sentence on why you are making this call. Hatch shows it to the user.');
export const hatch = z.string().optional().describe('Hatch id from list_hatches, or a link the user copied in Hatch, which reads hatch:@ and an id. Leave it out to act on your current Hatch.');
export const timeoutS = (fallback: number) => z.number().min(1).max(3600).default(fallback).describe(`Seconds to wait. When they run out Hatch returns the current state and the work carries on. Default ${fallback}, which sits inside every agent app's own limit on one call.`);
export const ref = z.string().describe('Element reference from the agent view, such as e12.');

/** An address in a few characters for the Activity panel: no scheme, and the middle cut from a long one. */
export function shortAddress(to: string): string {
  const text = to.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return text.length > 48 ? `${text.slice(0, 30)}…${text.slice(-16)}` : text;
}
