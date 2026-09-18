import { useEffect, useMemo, useRef, useState } from 'react';
import { authorLabel, USER, type Anchor, type CommentThread } from '@shared/comments';
import type { Rect } from '@shared/geometry';
import type { Hatch } from '@shared/types';
import { BinIcon, CheckIcon, CloseIcon, EditIcon } from '../icons';
import { actions, useStore } from '../state/store';
import { pageElement, readyPage } from './webviews';

interface Box { x: number; y: number; w: number; h: number }
interface Picked { rect: Box; take: boolean; anchor: Anchor; label: string }
type IpcMessage = Event & { channel: string; args: unknown[] };

const POPOVER_WIDTH = 400;
const DRAFT = 'draft';
const NO_THREADS: CommentThread[] = [];

interface Props {
  hatch: Hatch;
  /** The page's viewport in screen pixels inside the canvas area. */
  screen: Rect;
  zoom: number;
}

/** Pins, the element picker and the thread popover for one Hatch. All of it draws in Hatch's own layer, so a page and an agent's screenshot never contain it. */
export function CommentLayer({ hatch, screen, zoom }: Props) {
  const id = hatch.id;
  const page = useStore((s) => s.comments[id]);
  const show = useStore((s) => s.settings.showComments);
  const picking = useStore((s) => s.picking === id);
  const purpose = useStore((s) => s.pickPurpose);
  const draft = useStore((s) => (s.draft?.hatchId === id ? s.draft : null));
  const openId = useStore((s) => (s.openThread?.hatchId === id ? s.openThread.threadId : null));
  const canvas = useStore((s) => s.viewport);
  const [rects, setRects] = useState<Record<string, Box | null>>({});
  const [hover, setHover] = useState<Box | null>(null);

  const threads = page?.threads ?? NO_THREADS;
  const pageKey = hatch.url.split(/[?#]/)[0];
  useEffect(() => void actions.loadComments(id), [id, pageKey]);

  // The page's script resolves each anchor and reports where its element sits. A navigation restarts that script, so the list goes again on every dom-ready.
  const tracked = useMemo(() => [...threads.map((t) => ({ id: t.id, anchor: t.anchor })), ...(draft ? [{ id: DRAFT, anchor: draft.anchor }] : [])], [threads, draft]);
  useEffect(() => {
    const el = pageElement(id);
    if (!el) return;
    const send = (): void => void readyPage(id)?.send('hatch:track', tracked).catch(() => {});
    const onMessage = (e: Event): void => {
      const { channel, args } = e as IpcMessage;
      if (channel === 'hatch:rects') {
        const next = args[0] as Record<string, Box | null>;
        setRects(next);
        actions.setMissing(id, Object.keys(next).filter((k) => next[k] === null && k !== DRAFT));
      }
      if (channel === 'hatch:grabbed') void actions.finishGrab(id, args[0] as Parameters<typeof actions.finishGrab>[1]);
      if (channel === 'hatch:picked') {
        const picked = args[0] as Picked | null;
        if (picked?.take) actions.setDraft({ hatchId: id, anchor: picked.anchor, label: picked.label });
        else setHover(picked?.rect ?? null);
      }
    };
    send();
    el.addEventListener('dom-ready', send);
    el.addEventListener('ipc-message', onMessage);
    return () => {
      el.removeEventListener('dom-ready', send);
      el.removeEventListener('ipc-message', onMessage);
    };
  }, [id, tracked]);

  useEffect(() => {
    if (!picking) setHover(null);
  }, [picking]);

  // Esc backs out of picking, a draft or an open thread before it deselects the Hatch.
  const busy = picking || !!draft || !!openId;
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (picking) actions.stopPicking();
      else actions.closeThread();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, picking]);

  if (hatch.view !== 'page') return null;

  const toScreen = (b: Box): Box => ({ x: screen.x + b.x * zoom, y: screen.y + b.y * zoom, w: b.w * zoom, h: b.h * zoom });
  /** A pin sits on its element's top right corner, and hides while that corner is scrolled out of the Hatch. */
  const pinPoint = (b: Box | null | undefined): { x: number; y: number } | null => {
    if (!b) return null;
    const x = Math.min(b.x + b.w, hatch.width);
    const y = Math.max(b.y, 0);
    if (b.y + b.h < 0 || b.y > screen.height / zoom || b.x > screen.width / zoom || b.x + b.w < 0) return null;
    return { x: screen.x + x * zoom, y: screen.y + y * zoom };
  };
  const pick = (take: boolean) => (e: React.PointerEvent | React.MouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    void readyPage(id)?.send('hatch:pick', { x: (e.clientX - box.left) / zoom, y: (e.clientY - box.top) / zoom, take, purpose });
  };

  const open = threads.find((t) => t.id === openId);
  const focusRect = draft ? rects[DRAFT] : open ? rects[open.id] : null;
  const fallback = { x: screen.x + screen.width - 24, y: screen.y + 24 };
  const orphans = threads.filter((t) => rects[t.id] === null).map((t) => t.id);
  /** The thread opens to the right of its pin. With no room there it opens under the element, so it never covers what the comment is about. */
  const popoverAt = (at: { x: number; y: number }, element: Box | null | undefined): React.CSSProperties => {
    const maxHeight = Math.min(440, canvas.height - 16);
    const width = Math.min(POPOVER_WIDTH, canvas.width - 16);
    const fitsRight = at.x + 20 + width <= canvas.width - 8;
    const left = fitsRight ? at.x + 20 : Math.min(Math.max(8, at.x + 12 - width), canvas.width - 8 - width);
    const top = fitsRight || !element ? at.y - 14 : toScreen(element).y + toScreen(element).h + 10;
    return { left, top: Math.min(Math.max(top, 8), Math.max(8, canvas.height - 8 - maxHeight)), width, maxHeight };
  };

  return (
    <>
      {picking && (
        <>
          <div className="pick-shield" style={{ left: screen.x, top: screen.y, width: screen.width, height: screen.height }} onPointerMove={pick(false)} onClick={pick(true)} data-testid={`pick-${id}`} />
          <div className="pick-hint" style={{ left: screen.x + 12, top: screen.y + 12 }} role="status">
            {purpose === 'grab' ? 'Click the element to copy for Paper. Esc cancels.' : 'Click the element your comment is about. Esc cancels.'}
          </div>
          {hover && <div className="pick-box" style={boxStyle(toScreen(hover))} />}
        </>
      )}
      {focusRect && pinPoint(focusRect) && <div className="pick-box dashed" style={boxStyle(toScreen(focusRect))} />}

      {show &&
        threads.map((t) => {
          // A comment stays with its page. When the page no longer holds its element, the pin waits at the Hatch's top right corner.
          const orphan = rects[t.id] === null;
          const at = orphan ? { x: fallback.x, y: fallback.y + orphans.indexOf(t.id) * 30 } : pinPoint(rects[t.id]);
          if (!at) return null;
          const state = t.status === 'resolved' ? 'resolved' : t.unread ? 'unread' : 'open';
          return (
            <button
              key={t.id}
              className={`pin ${state}${t.id === openId ? ' current' : ''}${orphan ? ' detached' : ''}`}
              style={{ left: at.x - 12, top: at.y - 12 }}
              onClick={() => (t.id === openId ? actions.closeThread() : actions.openThread(id, t.id))}
              aria-label={`Comment ${t.number} on ${t.label}, ${state === 'unread' ? 'new reply from an agent' : state}${orphan ? ', element not found on the page' : ''}`}
              title={orphan ? 'The page no longer holds the element this comment points at.' : undefined}
              data-testid={`pin-${t.number}`}
            >
              {t.status === 'resolved' ? <CheckIcon size={10} /> : t.number}
            </button>
          );
        })}

      {draft && (
        <div className="thread" style={popoverAt(pinPoint(rects[DRAFT]) ?? fallback, rects[DRAFT])} role="dialog" aria-label="New comment">
          <header>
            <strong>New comment · {draft.label}</strong>
            <button className="icon-button small" aria-label="Discard this comment" onClick={actions.closeThread}>
              <CloseIcon />
            </button>
          </header>
          <Composer placeholder="Write your comment" button="Pin it" autoFocus onSend={(text) => actions.submitDraft(text).then(() => true)} />
          <ThreadError />
        </div>
      )}
      {open && <Thread key={open.id} hatchId={id} thread={open} style={popoverAt(pinPoint(rects[open.id]) ?? fallback, rects[open.id])} orphan={rects[open.id] === null} />}
    </>
  );
}

const boxStyle = (b: Box): React.CSSProperties => ({ left: b.x, top: b.y, width: b.w, height: b.h });

const timeOf = (iso: string): string => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
};

function ThreadError() {
  const error = useStore((s) => s.commentError);
  return error ? (
    <p className="field-error thread-error" role="alert">
      {error}
    </p>
  ) : null;
}

function Thread({ hatchId, thread, style, orphan }: { hatchId: string; thread: CommentThread; style: React.CSSProperties; orphan: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const resolved = thread.status === 'resolved';

  useEffect(() => {
    if (body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [thread.messages.length]);

  return (
    <div className="thread" style={style} role="dialog" aria-label={`Comment ${thread.number} on ${thread.label}`} data-testid="thread">
      <header>
        <strong>
          {thread.number} · {thread.label}
        </strong>
        {resolved && <span className="badge">Resolved</span>}
        <span className="header-space" />
        <button className="icon-button small" aria-label="Delete this thread" onClick={() => setConfirming(true)}>
          <BinIcon />
        </button>
        <button className="icon-button small" aria-label={resolved ? 'Open this thread again' : 'Resolve this thread'} aria-pressed={resolved} onClick={() => void actions.setCommentStatus(hatchId, thread.id, resolved ? 'open' : 'resolved')} data-testid="thread-resolve">
          <CheckIcon size={14} />
        </button>
        <button className="icon-button small" aria-label="Close this thread" onClick={actions.closeThread}>
          <CloseIcon />
        </button>
      </header>
      {confirming && (
        <div className="thread-confirm" role="alertdialog" aria-label="Delete this thread?">
          <span>Delete this thread and its {thread.messages.length === 1 ? 'message' : `${thread.messages.length} messages`}?</span>
          <button className="button primary" onClick={() => void actions.removeComment(hatchId, thread.id)}>
            Delete
          </button>
          <button className="button" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      )}
      {orphan && <p className="thread-note">Element not found. The page no longer holds the element this comment points at.</p>}
      <div className="thread-body" ref={body}>
        {thread.messages.map((m, i) => (
          <article key={i} className={m.author === USER ? 'message' : 'message agent'}>
            <div className="message-head">
              <strong>{authorLabel(m.author)}</strong>
              <span className="mono">{timeOf(m.at)}</span>
              {m.edited && <span className="edited">edited</span>}
              <span className="header-space" />
              {m.author === USER && editing !== i && (
                <button className="icon-button small" aria-label="Edit this message" onClick={() => setEditing(i)}>
                  <EditIcon />
                </button>
              )}
            </div>
            {editing === i ? (
              <Composer initial={m.text} button="Save" autoFocus onCancel={() => setEditing(null)} onSend={async (text) => {
                const ok = await actions.editComment(hatchId, thread.id, i, text);
                if (ok) setEditing(null);
                return ok;
              }} />
            ) : (
              <p>{m.text}</p>
            )}
          </article>
        ))}
      </div>
      <Composer placeholder="Reply" button="Send" onSend={(text) => actions.replyComment(hatchId, thread.id, text)} />
      <ThreadError />
    </div>
  );
}

function Composer({ placeholder, button, initial = '', autoFocus, onSend, onCancel }: { placeholder?: string; button: string; initial?: string; autoFocus?: boolean; onSend(text: string): Promise<boolean>; onCancel?(): void }) {
  const [text, setText] = useState(initial);
  const [sending, setSending] = useState(false);
  const send = async (): Promise<void> => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await onSend(text.trim());
    setSending(false);
    if (ok && !onCancel) setText('');
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        value={text}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Message'}
        rows={Math.min(6, Math.max(1, text.split('\n').length))}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, and Shift+Enter starts a new line.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        data-testid="composer"
      />
      {onCancel && (
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      )}
      <button type="submit" className="button primary" disabled={!text.trim() || sending}>
        {button}
      </button>
    </form>
  );
}
