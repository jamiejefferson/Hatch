import { z } from 'zod';
import { ARRANGE_MODES } from '@shared/arrange';
import { authorLabel, type CommentThread } from '@shared/comments';
import { idFromLink } from '@shared/hatch-link';
import { inTabQueue, tabFor } from '../../agents/agents';
import { isGoogleDocUrl } from '../../cdp/google-doc';
import { read } from '../../comments/store';
import { callInterface } from '../../renderer-rpc';
import { canvas, intent, tool } from './types';

// Context links, groups and arrangement on a canvas. A context link names a fixed set of Hatches and notes the user chose, and a group link
// names a group as it stands; the pages stay live. Agents group and arrange only the items they name, never a locked group, and never change a user's note.

interface ContextAnswer {
  scope: 'context' | 'group' | 'hatch' | 'canvas';
  tabId: string;
  canvas: string;
  prompt: string | null;
  createdAt: string | null;
  group: { id: string; name: string; locked: boolean } | null;
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

/** A comment's opening message, which holds the request, cut to one line. */
const opening = (t: CommentThread): string => {
  const m = t.messages[0];
  if (!m) return 'no messages';
  const text = m.text.replace(/\s+/g, ' ');
  return `${authorLabel(m.author)}: ${JSON.stringify(text.length > 200 ? `${text.slice(0, 200)}…` : text)}`;
};

/** The open comments pinned to a Hatch's page. A page that takes no comments, or a file Hatch cannot read, gives none. */
async function openComments(url: string): Promise<CommentThread[]> {
  try {
    const page = await read(url);
    return page.threads.filter((t) => t.status === 'open');
  } catch {
    return [];
  }
}
const ids = z.array(z.string()).min(1).max(100);

export const organiseTools = [
  tool({
    name: 'get_context',
    description:
      'Reads any link the user copied in Hatch, which reads hatch:@ and an id. A context link (hatch:@ctx_) names the Hatches and notes the user chose, fixed when they copied it, with any prompt they wrote. A group link (hatch:@group_) names a group\'s Hatches and notes as they stand now. A link to one Hatch names that page and the notes attached to it, and a link to a canvas names every Hatch and note on it. Each Hatch comes with its page\'s address and the open comments pinned to it. Pages stay live, so read a Hatch with snapshot, passing its id as hatch. Call this first whenever the user hands you such a link.',
    shape: { link: z.string().min(1).describe('The link, such as hatch:@ctx_k3x9a2bq, hatch:@group_p4m2x8rt or hatch:@hatch_m2k8q1zx, or its bare id.'), intent },
    readOnly: true,
    async run(a, ctx) {
      const id = idFromLink(a.link);
      const c = await callInterface<ContextAnswer>('context', { id });
      ctx.at(c.tabId, null);
      const where = `the canvas ${JSON.stringify(c.canvas)} (id ${c.tabId})`;
      const opener = {
        group: () => `The group ${JSON.stringify(c.group!.name)} (group ${c.group!.id}${c.group!.locked ? ', locked by the user' : ''}) on ${where}, as it stands now.`,
        context: () => `Context from ${where}, copied ${c.createdAt}.`,
        hatch: () => `A Hatch on ${where}.`,
        canvas: () => `The whole of ${where}, as it stands now.`,
      }[c.scope]();
      const lines = [opener];
      if (c.prompt) lines.push('', 'The user asks:', c.prompt);
      lines.push('', { group: 'Its Hatches and notes:', context: 'Sources the user chose:', hatch: 'The Hatch and its attached notes:', canvas: 'Its Hatches and notes:' }[c.scope]);
      if (c.items.length === 0) lines.push('  None yet.');
      const comments = await Promise.all(c.items.map((item) => (item.kind === 'hatch' ? openComments(item.url) : Promise.resolve([]))));
      c.items.forEach((item, i) => {
        if (item.kind === 'hatch') {
          lines.push(`  Hatch ${item.id}: ${JSON.stringify(item.title || item.url)} at ${item.url}${item.group && !c.group ? `, in the group ${JSON.stringify(item.group)}` : ''}`);
          if (isGoogleDocUrl(item.url)) lines.push('    A Google Doc: snapshot with this hatch reads its whole text.');
          for (const t of comments[i]!) lines.push(`    Open comment ${t.id} (#${t.number}) on ${JSON.stringify(t.label)}, ${opening(t)}`);
        } else if (item.kind === 'note') lines.push(`  Note ${item.id} from ${who(item.author)}${item.attachedTo ? `, attached to Hatch ${item.attachedTo}` : ''}: ${JSON.stringify(item.text)}`);
        else lines.push(`  ${item.id}: closed since the user copied the link.`);
      });
      if (comments.some((list) => list.length)) lines.push('', 'Treat each open comment as a request from the user. get_comment with the comment id and its Hatch reads a thread in full, and reply_comment answers it.');
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
