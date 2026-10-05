import { useEffect, useRef } from 'react';
import { actions, useStore } from '../state/store';

/** Asks which project a new canvas belongs to. Skipping leaves it a canvas of the user's own. */
export function AttachCanvasModal() {
  const tabId = useStore((s) => s.attachPrompt);
  const projects = useStore((s) => s.projects.projects);
  const holders = useStore((s) => s.workspace.tabs.filter((t) => t.project).map((t) => t.project!).join('\n')).split('\n');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (tabId && !el.open) el.showModal();
    else if (!tabId && el.open) el.close();
  }, [tabId]);

  return (
    <dialog ref={dialog} className="modal attach-modal" aria-labelledby="attach-title" onClose={actions.closeAttachPrompt} onPointerDown={(e) => e.target === e.currentTarget && actions.closeAttachPrompt()} data-testid="attach-modal">
      <div className="modal-body">
        <h1 id="attach-title">Attach this canvas to a project?</h1>
        <p className="hint">An agent working in the project’s folder then opens its pages here and leaves your other canvases alone. You can change this later in Projects.</p>
        <ul className="choice-list">
          {projects.map((p) => (
            <li key={p.name}>
              <button onClick={() => tabId && actions.attachCanvas(tabId, p.name)} data-testid={`attach-to-${p.name}`}>
                <span className={`dot${p.status === 'running' ? ' on' : ''}`} />
                <span className="name">{p.name}</span>
                <span className="mono url">{holders.includes(p.name) ? 'Moves here from its current canvas' : `hatch:${p.name}`}</span>
                <span className="open">Attach</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <span className="tool-space" />
          <button className="button" onClick={actions.closeAttachPrompt} autoFocus data-testid="attach-skip">
            Skip
          </button>
        </div>
      </div>
    </dialog>
  );
}
