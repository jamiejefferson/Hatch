import type { CommentThread } from '@shared/comments';
import type { Hatch, Note } from '@shared/types';
import { noteAuthor } from '../canvas/Notes';
import { CheckIcon } from '../icons';
import { actions, activeTab, fitHatch, hatchLabel, useStore, type State } from '../state/store';

/** What the Comments tab label counts: the open threads and the notes on the current canvas. */
export const openThreadCount = (s: State): number => {
  const tab = activeTab(s);
  return tab.hatches.reduce((n, h) => n + (s.comments[h.id]?.threads.filter((t) => t.status === 'open').length ?? 0), 0) + (tab.notes?.length ?? 0);
};

const firstAuthor = (t: CommentThread): string => {
  const author = t.messages[0]?.author;
  return !author || author === 'user' ? 'You' : author;
};

function summary(t: CommentThread, hatch: Hatch, missing: boolean): string {
  const head = `${firstAuthor(t)} · ${hatchLabel(hatch)}`;
  if (missing) return `${head} · Element not found`;
  if (t.status === 'resolved') return `${head} · Resolved`;
  if (t.unread) return `${head} · New reply`;
  const replies = t.messages.length - 1;
  return replies > 0 ? `${head} · ${replies} ${replies === 1 ? 'reply' : 'replies'}` : head;
}

type Item = { kind: 'comment'; at: string; hatch: Hatch; thread: CommentThread } | { kind: 'note'; at: string; note: Note };

/**
 * Comments and notes in one list, in the order they were made, so the tab scrolls once however many there are.
 * Two switches choose the kinds, and the menu chooses open or resolved comments. A note has no status, so it shows with the open ones.
 */
export function CommentsPanel() {
  const tab = useStore(activeTab);
  const comments = useStore((s) => s.comments);
  const missing = useStore((s) => s.missing);
  const show = useStore((s) => s.settings.showComments);
  const filter = useStore((s) => s.commentFilter);
  const kinds = useStore((s) => s.listKinds);
  const openThread = useStore((s) => s.openThread);
  const selectedNote = useStore((s) => s.selectedNote);
  const fit = fitHatch(tab) !== null;

  const threads = tab.hatches.flatMap((h) => (comments[h.id]?.threads ?? []).map((t) => ({ hatch: h, thread: t })));
  const notes = tab.notes ?? [];
  const items: Item[] = [
    ...(kinds.comments ? threads.filter(({ thread }) => thread.status === filter).map(({ hatch, thread }) => ({ kind: 'comment' as const, at: thread.messages[0]?.at ?? '', hatch, thread })) : []),
    ...(kinds.notes && filter === 'open' ? notes.map((note) => ({ kind: 'note' as const, at: note.createdAt, note })) : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const errors = tab.hatches.map((h) => comments[h.id]?.error).filter((e): e is string => Boolean(e));
  const openCount = threads.filter(({ thread }) => thread.status === 'open').length;

  const empty = !kinds.comments && !kinds.notes ? 'Switch on comments or notes to list them.' : filter === 'resolved' ? 'No resolved comments on this canvas.' : 'Nothing here yet. Choose the comment tool in the toolbar and click an element on a page, or choose the note tool and click the canvas.';

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Comments</h1>
      </header>
      <button type="button" role="switch" aria-checked={show} className="switch-row" onClick={() => void actions.updateSettings({ showComments: !show })}>
        <span>Show comments on the page</span>
        <span className="switch" aria-hidden="true" />
      </button>
      <div className="list-filters">
        <div className="kind-chips" role="group" aria-label="What to list">
          <button className={`kind-chip${kinds.comments ? ' on' : ''}`} aria-pressed={kinds.comments} onClick={() => actions.setListKind('comments', !kinds.comments)} data-testid="list-comments">
            Comments <span className="count">{openCount}</span>
          </button>
          <button className={`kind-chip${kinds.notes ? ' on' : ''}`} aria-pressed={kinds.notes} onClick={() => actions.setListKind('notes', !kinds.notes)} data-testid="list-notes">
            Notes <span className="count">{notes.length}</span>
          </button>
        </div>
        <label className="status-menu">
          <span className="visually-hidden">Which comments to list</span>
          <select value={filter} onChange={(e) => actions.setCommentFilter(e.target.value as 'open' | 'resolved')} data-testid="comments-status">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
      </div>
      {fit && kinds.notes && notes.length > 0 && (
        <p className="hint boxed" data-testid="notes-hidden">
          Notes hide in Fit to view. Pick one to go back to the canvas and see it.
        </p>
      )}
      {errors.map((e) => (
        <p key={e} className="field-error" role="alert">
          {e}
        </p>
      ))}

      {items.length === 0 ? (
        <p className="hint" data-testid="no-comments">
          {empty}
        </p>
      ) : (
        <ul className="thread-list" data-testid="comment-list">
          {items.map((item) => {
            if (item.kind === 'note') {
              const { note } = item;
              return (
                <li key={note.id}>
                  <button className={selectedNote === note.id ? 'active' : ''} onClick={() => actions.showNote(note.id)} data-testid="note-row">
                    <span className="note-swatch" aria-hidden="true" />
                    <span className="thread-text">
                      <span className="name">{note.text || 'Empty note'}</span>
                      <span className="state">Note · {noteAuthor(note)}</span>
                    </span>
                  </button>
                </li>
              );
            }
            const { hatch, thread: t } = item;
            const lost = (missing[hatch.id] ?? []).includes(t.id);
            const active = openThread?.hatchId === hatch.id && openThread.threadId === t.id;
            return (
              <li key={t.id}>
                <button className={active ? 'active' : ''} onClick={() => actions.showThread(hatch.id, t.id)} data-testid="comment-row">
                  <span className={`pin-mark ${t.status === 'resolved' ? 'resolved' : t.unread ? 'unread' : 'open'}`}>{t.status === 'resolved' ? <CheckIcon size={12} /> : t.number}</span>
                  <span className="thread-text">
                    <span className="name">{t.messages[0]?.text || t.label}</span>
                    <span className="state">{summary(t, hatch, lost)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
