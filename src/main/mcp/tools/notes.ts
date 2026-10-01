import { z } from 'zod';
import { inTabQueue, tabFor } from '../../agents/agents';
import { callInterface } from '../../renderer-rpc';
import type { Note } from '@shared/types';
import { canvas, intent, tool } from './types';

// Notes are post-its on a canvas. An agent adds them and reads them; the user alone edits or deletes one (JJ, 1 Oct 2026).

const who = (n: Note): string => (n.author === 'user' ? 'the user' : n.author);

export const noteTools = [
  tool({
    name: 'list_notes',
    description: 'Lists the notes on a canvas: post-its the user and agents stuck on the canvas itself, about the work as a whole rather than one element of a page. Read them for context before you work, and take a note from the user as a request.',
    shape: { canvas, intent },
    readOnly: true,
    async run(a, ctx) {
      const { tabId, state } = await tabFor(ctx.agent, a.canvas);
      ctx.at(tabId, null);
      const notes = await callInterface<Note[]>('notes', { tabId });
      const label = state.tabs.find((t) => t.id === tabId)?.label ?? tabId;
      if (notes.length === 0) return `The canvas ${JSON.stringify(label)} has no notes.`;
      return [`Notes on ${JSON.stringify(label)}, oldest first:`, ...notes.map((n) => `  ${n.id}  from ${who(n)}, ${n.createdAt}: ${JSON.stringify(n.text)}`)].join('\n');
    },
  }),
  tool({
    name: 'add_note',
    description: 'Sticks a note on a canvas, beside its Hatches, where the user sees it and the Comments tab lists it. Use it for a finding about the canvas as a whole; to point at one element of a page, use add_comment. Agents cannot change or remove a note once it is there, so write it whole.',
    shape: { text: z.string().min(1).max(2000), canvas, intent },
    summary: () => 'add_note',
    async run(a, ctx) {
      const { tabId } = await tabFor(ctx.agent, a.canvas);
      ctx.at(tabId, null);
      return inTabQueue(tabId, async () => {
        const id = await callInterface<string>('addNote', { tabId, text: a.text, author: ctx.agent.id });
        return `Added note ${id} to the canvas. The user sees it beside the Hatches, and it stays until the user removes it.`;
      });
    },
  }),
];
