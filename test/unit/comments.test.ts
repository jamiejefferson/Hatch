import { describe, expect, it } from 'vitest';
import { pageSlug, parseFile, renderFile, type CommentThread } from '@shared/comments';

const thread = (over: Partial<CommentThread> = {}): CommentThread => ({
  id: 'c_one',
  number: 1,
  label: 'Team plan card',
  status: 'open',
  unread: false,
  anchor: { tag: 'div', cssPath: '#plans > div:nth-of-type(2)', text: 'Team' },
  messages: [{ author: 'user', at: '2026-09-17T13:34:00.000Z', text: 'Make the Team card stand out more.', edited: false }],
  ...over,
});

describe('comment files', () => {
  it('round-trips threads, replies, edits and status', () => {
    const threads = [
      thread({ messages: [...thread().messages, { author: 'claude-code', at: '2026-09-17T13:36:00.000Z', text: 'I filled the card.\n\nReload to check it.', edited: false }], unread: true }),
      thread({ id: 'c_two', number: 2, label: 'Work email', status: 'resolved', messages: [{ author: 'user', at: '2026-09-17T14:00:00.000Z', text: 'Wider, please.', edited: true }] }),
    ];
    const parsed = parseFile(renderFile('/pricing', threads));
    expect(parsed).toEqual({ ok: true, path: '/pricing', threads });
  });

  it('keeps a message line that looks like a heading', () => {
    const t = thread({ messages: [{ author: 'user', at: '2026-09-17T13:34:00.000Z', text: '## Use this heading\n### and this one', edited: false }] });
    const parsed = parseFile(renderFile('/', [t]));
    expect(parsed.ok && parsed.threads[0]!.messages[0]!.text).toBe('## Use this heading\n### and this one');
  });

  it('survives a delete: the remaining thread keeps its number', () => {
    const parsed = parseFile(renderFile('/', [thread({ id: 'c_two', number: 2 })]));
    expect(parsed.ok && parsed.threads[0]!.number).toBe(2);
  });

  it('reads a hand edit to the words', () => {
    const text = renderFile('/', [thread()]).replace('stand out more', 'stand out far more');
    const parsed = parseFile(text);
    expect(parsed.ok && parsed.threads[0]!.messages[0]!.text).toContain('far more');
  });

  it('reads an empty file as no comments', () => {
    expect(parseFile('')).toEqual({ ok: true, path: null, threads: [] });
  });

  it.each([
    ['a missing id', (s: string) => s.replace(/- id: .*\n/, '')],
    ['a broken anchor', (s: string) => s.replace(/- anchor: .*/, '- anchor: {oops')],
    ['an unknown status', (s: string) => s.replace('- status: open', '- status: later')],
    ['a broken message heading', (s: string) => s.replace('### You · 2026-09-17T13:34:00.000Z', '### Someone yesterday')],
    ['a broken comment heading', (s: string) => s.replace('## 1 · Team plan card', '## Team plan card')],
  ])('refuses a file with %s and names the line', (_label, damage) => {
    const parsed = parseFile(damage(renderFile('/', [thread()])));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toMatch(/^Line \d+:/);
  });
});

describe('page file names', () => {
  it('names the home page index', () => expect(pageSlug('/')).toBe('index'));
  it('flattens a nested path', () => expect(pageSlug('/docs/getting-started/')).toBe('docs__getting-started'));
  it('drops characters a file name cannot hold and leading dots', () => expect(pageSlug('/../a b?c')).toBe('__a-b-c'));
});
