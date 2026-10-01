import type { CommentThread } from '@shared/comments';
import { CheckIcon } from '../icons';
import { actions, activeTab, hatchLabel, useStore, type State } from '../state/store';

/** The open threads on the current canvas, which the Comments tab label counts. */
export const openThreadCount = (s: State): number => activeTab(s).hatches.reduce((n, h) => n + (s.comments[h.id]?.threads.filter((t) => t.status === 'open').length ?? 0), 0);

const firstAuthor = (t: CommentThread): string => {
  const author = t.messages[0]?.author;
  return !author || author === 'user' ? 'You' : author;
};

function summary(t: CommentThread, missing: boolean): string {
  if (missing) return 'Element not found';
  if (t.status === 'resolved') return `${firstAuthor(t)} · Resolved`;
  if (t.unread) return `${firstAuthor(t)} · New reply`;
  const replies = t.messages.length - 1;
  return `${firstAuthor(t)} · ${replies > 0 ? `${replies} ${replies === 1 ? 'reply' : 'replies'}` : 'Open'}`;
}

/** Every thread on the canvas, grouped under its Hatch. A click selects the Hatch and opens the thread over its pin. */
export function CommentsPanel() {
  const tab = useStore(activeTab);
  const comments = useStore((s) => s.comments);
  const missing = useStore((s) => s.missing);
  const show = useStore((s) => s.settings.showComments);
  const filter = useStore((s) => s.commentFilter);
  const openThread = useStore((s) => s.openThread);

  const groups = tab.hatches
    .map((h) => ({ hatch: h, page: comments[h.id], threads: (comments[h.id]?.threads ?? []).filter((t) => t.status === filter) }))
    .filter((g) => g.threads.length > 0 || g.page?.error);

  return (
    <>
      <header className="panel-head">
        <h1 className="panel-title">Comments</h1>
      </header>
      <button type="button" role="switch" aria-checked={show} className="switch-row" onClick={() => void actions.updateSettings({ showComments: !show })}>
        <span>Show comments on the page</span>
        <span className="switch" aria-hidden="true" />
      </button>
      <div className="segmented" role="radiogroup" aria-label="Which comments to list">
        {(['open', 'resolved'] as const).map((f) => (
          <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'current' : ''} onClick={() => actions.setCommentFilter(f)} data-testid={`comments-${f}`}>
            {f === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="hint" data-testid="no-comments">
          {filter === 'open' ? 'No open comments on this canvas. Choose the comment tool in the toolbar, then click an element on a page to pin one.' : 'No resolved comments on this canvas.'}
        </p>
      ) : (
        groups.map(({ hatch, page, threads }) => (
          <section key={hatch.id} className="comment-group" data-testid={`comment-group-${hatch.id}`}>
            <h2 className="comment-group-title">{hatchLabel(hatch)}</h2>
            {page?.error && (
              <p className="field-error" role="alert">
                {page.error}
              </p>
            )}
            <ul className="thread-list">
              {threads.map((t) => {
                const lost = (missing[hatch.id] ?? []).includes(t.id);
                const active = openThread?.hatchId === hatch.id && openThread.threadId === t.id;
                return (
                  <li key={t.id}>
                    <button className={active ? 'active' : ''} onClick={() => actions.showThread(hatch.id, t.id)} data-testid="comment-row">
                      <span className={`pin-mark ${t.status === 'resolved' ? 'resolved' : t.unread ? 'unread' : 'open'}`}>{t.status === 'resolved' ? <CheckIcon size={12} /> : t.number}</span>
                      <span className="thread-text">
                        <span className="name">{t.messages[0]?.text || t.label}</span>
                        <span className="state">{summary(t, lost)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
