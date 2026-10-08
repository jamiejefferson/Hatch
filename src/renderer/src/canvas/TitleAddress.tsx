import { useEffect, useRef, useState } from 'react';
import type { Hatch } from '@shared/types';
import { displayAddress, hatchLabel, resolveAddress, useStore } from '../state/store';
import { pages } from './webviews';

interface Props {
  hatch: Hatch;
  editing: boolean;
  /** Where the title is no drag handle, a click on it opens the field. On the canvas the drag decides instead, because a drag that never moves is a click. */
  onEdit?(): void;
  onDone(): void;
}

/** A Hatch's title, which turns into its link on a click: Enter goes there, and Esc or a click elsewhere puts the title back. */
export function TitleAddress({ hatch, editing, onEdit, onDone }: Props) {
  if (!editing) {
    return (
      <span className="hatch-title" title="Click to change the link" onClick={onEdit} data-testid={`title-${hatch.id}`}>
        {hatchLabel(hatch)}
      </span>
    );
  }
  return <AddressInput hatch={hatch} onDone={onDone} />;
}

function AddressInput({ hatch, onDone }: { hatch: Hatch; onDone(): void }) {
  const shown = useStore((s) => displayAddress(s, hatch.url));
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const go = (e: React.FormEvent): void => {
    e.preventDefault();
    const resolved = resolveAddress(text, true);
    if ('error' in resolved) return setError(resolved.error);
    pages.navigate(hatch.id, resolved.url);
    onDone();
  };

  return (
    <form className="title-address" onSubmit={go} onPointerDown={(e) => e.stopPropagation()} noValidate>
      <input
        ref={input}
        className={`mono${error ? ' invalid' : ''}`}
        aria-label="Link"
        aria-invalid={error !== null}
        title={error ?? undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={onDone}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onDone();
        }}
        data-testid={`title-link-${hatch.id}`}
      />
      {error && (
        <span className="title-address-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
