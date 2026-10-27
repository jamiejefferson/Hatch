import { z } from 'zod';
import { ARRANGE_MODES } from '@shared/arrange';
import { idFromLink } from '@shared/hatch-link';
import { inTabQueue, tabFor } from '../../agents/agents';
import { callInterface } from '../../renderer-rpc';
import { canvas, intent, tool } from './types';

// Context links, groups and arrangement on a canvas. A context link names a fixed set of Hatches and notes the user chose;
// the pages stay live. Agents group and arrange only the items they name, never a locked group, and never change a user's note.

interface ContextAnswer {
  tabId: string;
  canvas: string;
  prompt: string | null;
  createdAt: string;
  items: ({ kind: 'hatch'; id: string; title: string; url: string; group: string | null } | { kind: 'note'; id: string; text: string; author: string; attachedTo: string | null; group: string | null } | { kind: 'gone'; id: string })[];
}

interface GroupAnswer {
  id: string;
  name: string;
  locked: boolean;
  members: { kind: 'hatch' | 'note'; id: string; title: string }[];
  attachedNotes: string[];
}

const who = (author: string): string => (author === 'user' ? 'the user' : author);
const ids = z.array(z.string()).min(1).max(100);

export const organiseTools = [
  tool({
    name: 'get_context',
    description:
      'Reads a context link the user copied in Hatch, which reads hatch:@ctx_ and an id. It names the Hatches and notes the user chose, fixed when they copied it, with any prompt they wrote. Pages stay live, so read a Hatch with snapshot or navigate as usual. Call this first whenever the user hands you such a link.',
    shape: { link: z.string().min(1).describe('The context link, such as hatch:@ctx_k3x9a2bq, or its bare id.'), intent },
    readOnly: true,
    async run(a, ctx) {
      const id = idFromLink(a.link);
      if (!id.startsWith('ctx_')) throw new Error('That is no context link. A context link reads hatch:@ctx_ and an id; a hatch:@ link to a Hatch or canvas goes to the tool that acts on it.');
      const c = await callInterface<ContextAnswer>('context', { id });
      ctx.at(c.tabId, null);
      const lines = [`Context from the canvas ${JSON.stringify(c.canvas)} (id ${c.tabId}), copied ${c.createdAt}.`];
      if (c.prompt) lines.push('', 'The user asks:', c.prompt);
      lines.push('', 'Sources the user chose:');
      for (const item of c.items) {
        if (item.kind === 'hatch') lines.push(`  Hatch ${item.id}: ${JSON.stringify(item.title || item.url)} at ${item.url}${item.group ? `, in the group ${JSON.stringify(item.group)}` : ''}`);
        else if (item.kind === 'note') lines.push(`  Note ${item.id} from ${who(item.author)}${item.attachedTo ? `, attached to Hatch ${item.attachedTo}` : ''}: ${JSON.stringify(item.text)}`);
        else lines.push(`  ${item.id}: closed since the user copied the link.`);
      }
      lines.push('', 'Put what you find beside these Hatches on the same canvas: open_hatch with that canvas, add_note with hatch to attach a finding to a page, and group_items to gather your results.');
      return { text: lines.join('\n'), tabId: c.tabId };
    },
  }),
  tool({
    name: 'list_groups',
    description: 'Lists the named groups on a canvas, with their Hatches and notes and whether the user locked them. A note attached to a Hatch belongs to its Hatch\'s group.',
    shape: { canvas, intent },
    readOnly: true,
    async run(a, ctx) {
      const { tabId, state } = await tabFor(ctx.agent, a.canvas);
      ctx.at(tabId, null);
      const groups = await callInterface<GroupAnswer[]>('groups', { tabId });
      const label = state.tabs.find((t) => t.id === tabId)?.label ?? tabId;
      if (groups.length === 0) return `The canvas ${JSON.stringify(label)} has no groups.`;
      return [
        `Groups on ${JSON.stringify(label)}:`,
        ...groups.flatMap((g) => [
          `  ${g.id}  ${JSON.stringify(g.name)}${g.locked ? ', locked by the user' : ''}`,
          ...g.members.map((m) => `    ${m.kind} ${m.id}: ${JSON.stringify(m.title)}`),
          ...(g.attachedNotes.length ? [`    attached notes: ${g.attachedNotes.join(', ')}`] : []),
        ]),
      ].join('\n');
    },
  }),
  tool({
    name: 'group_items',
    description: 'Gathers Hatches and notes on a canvas into a named group with an outline, such as the results of a search. The items leave any group they were in. Attached notes come with their Hatch. Hatch refuses items in a locked group.',
    shape: { ids: ids.describe('Hatch and note ids, two or more.'), name: z.string().min(1).max(60).describe('A short name the user reads above the group, such as "Repair examples".'), canvas, intent },
    summary: (a) => `group_items ${a.ids.length}`,
    async run(a, ctx) {
      const { tabId } = await tabFor(ctx.agent, a.canvas);
      ctx.at(tabId, null);
      return inTabQueue(tabId, async () => {
        const id = await callInterface<string>('groupItems', { tabId, ids: a.ids, name: a.name });
        return `Grouped ${a.ids.length} items as ${JSON.stringify(a.name)} (group ${id}). The user can undo it with Cmd+Z.`;
      });
    },
  }),
  tool({
    name: 'arrange_items',
    description:
      'Arranges the Hatches and notes you name, or one group, and nothing else. Pages keep their sizes and attached notes move with their Hatch. tidy keeps the rough order in neat rows; row, column and grid lay items out in reading order; align-* lines up edges or centres; distribute-* spaces three or more evenly. Hatch refuses items in a locked group.',
    shape: {
      mode: z.enum(ARRANGE_MODES as [string, ...string[]]),
      ids: ids.optional().describe('Hatch and note ids, two or more. Leave it out when you pass group.'),
      group: z.string().optional().describe('A group id from list_groups, to arrange all its items.'),
      canvas,
      intent,
    },
    summary: (a) => `arrange_items ${a.mode}`,
    async run(a, ctx) {
      if (!a.ids && !a.group) throw new Error('Name the items with ids, or a group with group.');
      const { tabId } = await tabFor(ctx.agent, a.canvas);
      ctx.at(tabId, null);
      return inTabQueue(tabId, async () => {
        const moved = await callInterface<number>('arrangeItems', { tabId, ids: a.ids, groupId: a.group, mode: a.mode });
        return moved === 0 ? 'Everything was in place already, so nothing moved.' : `Moved ${moved} ${moved === 1 ? 'item' : 'items'} (${a.mode}). The user can undo it with Cmd+Z.`;
      });
    },
  }),
];
