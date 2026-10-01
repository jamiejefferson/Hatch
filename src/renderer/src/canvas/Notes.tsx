import { useEffect, useRef } from 'react';
import type { Point } from '@shared/geometry';
import type { Note, Tab } from '@shared/types';
import { BinIcon } from '../icons';
import { actions, NOTE_SIZE, useStore } from '../state/store';
import { startDrag } from './drag';

export const noteAuthor = (note: Note): string => (note.author === 'user' ? 'You' : note.author);

/**
 * The canvas's notes, drawn above the pages at a fixed size on screen, so a note stays readable at every zoom while it keeps its place on the canvas.
 * Fit to view shows one page alone, so the notes wait until it ends.
 */
export function Notes({ tab, pan, zoom, origin }: { tab: Tab; pan: Point; zoom: number; origin: () => DOMRect | null }) {
  const placing = useStore((s) => s.placingNote);
  const selected = useStore((s) => s.selectedNote);
  const editing = useStore((s) => s.editingNote);

  const place = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    const box = origin();
    if (!box) return;
    e.preventDefault();
    actions.placeNote({ x: (e.clientX - box.left - pan.x) / zoom, y: (e.clientY - box.top - pan.y) / zoom });
  };

  return (
    <>
      {(tab.notes ?? []).map((n) => (
        <NoteCard key={n.id} note={n} left={n.x * zoom + pan.x} top={n.y * zoom + pan.y} zoom={zoom} selected={n.id === selected} editing={n.id === editing} />
      ))}
      {placing && <div className="note-placer" onPointerDown={place} aria-label="Click where the note goes" data-testid="note-placer" />}
    </>
  );
}

function NoteCard({ note, left, top, zoom, selected, editing }: { note: Note; left: number; top: number; zoom: number; selected: boolean; editing: boolean }) {
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = field.current;
    if (!editing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const drag = (e: React.PointerEvent): void => {
    if (e.button !== 0 || editing || (e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const start = { x: note.x, y: note.y };
    startDrag(e, {
      cursor: 'grabbing',
      onMove: (dx, dy) => actions.moveNote(note.id, start.x + dx / zoom, start.y + dy / zoom),
      onEnd: (moved) => {
        if (!moved) actions.selectNote(note.id);
      },
    });
  };

  return (
    <div className={`note${selected ? ' selected' : ''}${editing ? ' editing' : ''}`} style={{ left, top, width: NOTE_SIZE.width }} onPointerDown={drag} onDoubleClick={() => actions.startEditingNote(note.id)} data-testid={`note-${note.id}`}>
      {selected && (
        <div className="note-bar">
          <span>{editing ? 'Esc to finish' : 'Double-click to edit'}</span>
          <button className="round small quiet" aria-label="Delete this note" title="Delete this note" onPointerDown={(e) => e.stopPropagation()} onClick={() => actions.deleteNote(note.id)} data-testid="note-delete">
            <BinIcon size={14} />
          </button>
        </div>
      )}
      <div className="note-paper">
        {editing ? (
          <textarea
            ref={field}
            aria-label="Note"
            placeholder="Write a note"
            value={note.text}
            rows={Math.max(3, note.text.split('\n').length)}
            onChange={(e) => actions.editNote(note.id, e.target.value)}
            onBlur={() => actions.finishNote()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                actions.finishNote();
              }
            }}
            data-testid="note-text"
          />
        ) : (
          <p className="note-text">{note.text}</p>
        )}
        <span className="note-author">{note.author === 'user' ? 'You' : `Agent · ${note.author}`}</span>
      </div>
    </div>
  );
}
