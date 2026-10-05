import { useEffect, useRef, useState } from 'react';
import { folderName } from '@shared/project-canvas';
import { FolderIcon } from '../icons';
import { actions, useStore } from '../state/store';

const home = (path: string): string => path.replace(/^\/Users\/[^/]+/, '~');

/** Asks which working folder a canvas belongs to: the folder where the project's work takes place. Skipping leaves it a canvas of the user's own. */
export function AttachCanvasModal() {
  const tabId = useStore((s) => s.attachPrompt);
  const holders = useStore((s) => s.workspace.tabs.filter((t) => t.folder && t.id !== s.attachPrompt).map((t) => t.folder!).join('\n')).split('\n');
  const [folders, setFolders] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (tabId && !el.open) {
      el.showModal();
      void window.hatch.workFolders().then(setFolders);
    } else if (!tabId && el.open) el.close();
  }, [tabId]);

  const choose = (): void => {
    if (!tabId) return;
    void window.hatch.pickFolder('Choose the folder where the work takes place').then((folder) => folder && actions.attachCanvas(tabId, folder));
  };

  return (
    <dialog ref={dialog} className="modal attach-modal" aria-labelledby="attach-title" onClose={actions.closeAttachPrompt} onPointerDown={(e) => e.target === e.currentTarget && actions.closeAttachPrompt()} data-testid="attach-modal">
      <div className="modal-body">
        <h1 id="attach-title">Which project folder is this canvas for?</h1>
        <p className="hint">An agent working in that folder, or in a folder inside it, opens its pages here and leaves your other canvases alone. You can change this later from the canvas’s menu or the sidebar.</p>
        {folders.length > 0 && (
          <ul className="choice-list">
            {folders.map((f) => (
              <li key={f}>
                <button onClick={() => tabId && actions.attachCanvas(tabId, f)} data-testid={`attach-to-${folderName(f)}`}>
                  <FolderIcon size={14} />
                  <span className="name">{folderName(f)}</span>
                  <span className="mono url">{holders.includes(f) ? 'Moves here from its current canvas' : home(f)}</span>
                  <span className="open">Attach</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="button" onClick={choose} data-testid="attach-choose">
            Choose a folder…
          </button>
          <span className="tool-space" />
          <button className="button" onClick={actions.closeAttachPrompt} autoFocus data-testid="attach-skip">
            Skip
          </button>
        </div>
      </div>
    </dialog>
  );
}
