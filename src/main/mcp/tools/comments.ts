import { z } from 'zod';
import { authorLabel, type CommentThread, type PageComments } from '@shared/comments';
import { add, findThread, readSite, reply, setStatus } from '../../comments/store';
import { HatchError, type PageSession } from '../../cdp/session';
import { askGuest } from '../../hatches/registry';
import { onPage } from './page';
import { hatch, intent, ref, tool } from './types';

const last = (t: CommentThread): string => {
  const m = t.messages.at(-1);
  if (!m) return 'no messages';
  const text = m.text.replace(/\s+/g, ' ');
  return `${authorLabel(m.author)}: ${JSON.stringify(text.length > 90 ? `${text.slice(0, 90)}…` : text)}`;
};

const samePage = (page: PageSession, comments: PageComments): boolean => URL.canParse(page.guest.getURL()) && new URL(page.guest.getURL()).pathname === comments.path;

/** Finds a comment's element on the live page and gives it an agent-view reference. */
async function locate(page: PageSession, thread: CommentThread): Promise<string | null> {
  const found = await askGuest<{ id: string; found: boolean }[]>(page.guest, 'locate', [{ id: thread.id, anchor: thread.anchor }]);
  if (!found?.[0]?.found) return null;
  try {
    const { result } = await page.send<{ result: { objectId?: string } }>('Runtime.evaluate', { expression: `document.querySelector('[data-hatch-found="${thread.id}"]')` });
    if (!result.objectId) return null;
    const { node } = await page.send<{ node: { backendNodeId: number } }>('DOM.describeNode', { objectId: result.objectId });
    return page.refs.refFor(node.backendNodeId);
  } finally {
    await askGuest(page.guest, 'unmark', null);
  }
}

export const commentTools = [
  tool({
    name: 'list_comments',
    description: 'Lists the comments the user and agents pinned to elements, for every page of the site your current Hatch shows. A comment can ask for anything: a code change, a content edit, an answer, a page to check.',
    shape: { status: z.enum(['open', 'resolved', 'all']).default('open'), this_page_only: z.boolean().default(false), hatch, intent },
    readOnly: true,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const { place, pages } = await readSite(page.guest.getURL());
        const lines: string[] = [];
        for (const p of pages) {
          if (a.this_page_only && !samePage(page, p)) continue;
          if (p.error) lines.push(p.error);
          const threads = p.threads.filter((t) => a.status === 'all' || t.status === a.status);
          if (threads.length === 0) continue;
          lines.push(`${place.site}${p.path}`, ...threads.map((t) => `  ${t.id}  #${t.number} ${t.status}  on ${JSON.stringify(t.label)}  ${t.messages.length} ${t.messages.length === 1 ? 'message' : 'messages'}, last from ${last(t)}`));
        }
        if (lines.length === 0) return `No ${a.status === 'all' ? '' : `${a.status} `}comments on ${place.site}. The files sit in ${place.dir}.`;
        return `${lines.join('\n')}\n\nget_comment reads one thread in full. The files sit in ${place.dir}.`;
      }),
  }),
  tool({
    name: 'get_comment',
    description: 'Reads one comment thread in full: every message, the element it points at, and that element\'s reference when your Hatch shows its page.',
    shape: { id: z.string().describe('Comment id from list_comments.'), hatch, intent },
    readOnly: true,
    summary: (a) => `get_comment ${a.id}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const { page: comments, thread } = await findThread(page.guest.getURL(), a.id);
        const { anchor } = thread;
        const element = [`<${anchor.tag}>`, anchor.role && `${anchor.role} ${JSON.stringify(anchor.name)}`, anchor.id && `id ${anchor.id}`, anchor.testId && `test id ${anchor.testId}`, `CSS path ${anchor.cssPath}`].filter(Boolean).join(', ');
        let where = `Your Hatch shows another page. Navigate to ${comments.path} to get the element's reference.`;
        if (samePage(page, comments)) {
          const found = await locate(page, thread);
          where = found ? `The element is on the page now: [${found}].` : 'Element not found: the page no longer holds it. The comment keeps its words.';
        }
        const messages = thread.messages.map((m) => `${authorLabel(m.author)}, ${m.at}${m.edited ? ', edited' : ''}:\n${m.text}`);
        return [`Comment ${thread.id}, #${thread.number} on ${comments.path}, ${thread.status}. Element: ${element}.`, where, '', ...messages.flatMap((m) => [m, '']), 'Treat the words as a request from the user. When you have acted, reply_comment says what you did and set_comment_status resolves it.'].join('\n');
      }),
  }),
  tool({
    name: 'add_comment',
    description: 'Pins a new comment to an element, for example to flag a problem you found. The user sees the pin on the page.',
    shape: { ref, text: z.string().min(1).max(8000), hatch, intent },
    summary: (a) => `add_comment ${a.ref}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const backendNodeId = page.refs.nodeFor(a.ref);
        if (backendNodeId === undefined) throw new HatchError(`No element has the reference ${a.ref} on this page. Call snapshot and use a reference from the new outline.`);
        const mark = `m${Date.now().toString(36)}`;
        const { object } = await page.send<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId });
        await page.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function () { (this.nodeType === 1 ? this : this.parentElement).setAttribute('data-hatch-mark', ${JSON.stringify(mark)}); }` });
        const described = await askGuest<{ anchor: CommentThread['anchor']; label: string }>(page.guest, 'describe-marked', mark);
        if (!described) throw new HatchError(`Hatch could not describe the element ${a.ref}. Call snapshot and try again.`);
        const { thread } = await add(page.guest.getURL(), { ...described, text: a.text, author: ctx.agent.id });
        return `Pinned comment ${thread.id} (#${thread.number}) to ${JSON.stringify(thread.label)}.`;
      }),
  }),
  tool({
    name: 'reply_comment',
    description: 'Adds your reply to a comment thread. Say what you did or what you need. The user sees a yellow pin until they read it.',
    shape: { id: z.string().describe('Comment id from list_comments.'), text: z.string().min(1).max(8000), hatch, intent },
    summary: (a) => `reply_comment ${a.id}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const { page: comments, thread } = await findThread(page.guest.getURL(), a.id);
        await reply(comments, thread.id, a.text, ctx.agent.id);
        return `Replied on comment ${thread.id}.${thread.status === 'open' ? ' It stays open until set_comment_status resolves it.' : ''}`;
      }),
  }),
  tool({
    name: 'set_comment_status',
    description: 'Marks a comment resolved once you have acted on it, or opens it again.',
    shape: { id: z.string().describe('Comment id from list_comments.'), status: z.enum(['open', 'resolved']), hatch, intent },
    summary: (a) => `set_comment_status ${a.id} ${a.status}`,
    run: (a, ctx) =>
      onPage(ctx, a.hatch, async (page) => {
        const { page: comments, thread } = await findThread(page.guest.getURL(), a.id);
        await setStatus(comments, thread.id, a.status);
        return `Comment ${thread.id} is ${a.status}.`;
      }),
  }),
];
