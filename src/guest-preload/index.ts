// Runs inside every live page, in an isolated world. The page's own scripts never see this code or `ipcRenderer`.
import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { Anchor } from '@shared/comments';
import { describeElement, resolveAnchor } from './anchors';
import { serialiseForPaper, cssBlockOf } from './grab';

// Hatch answers every alert, confirm and prompt itself. Electron throws on prompt(), and it settles alert and confirm
// on its own when the window sits in the background, which is where Hatch usually sits while an agent works.
// Each stand-in blocks the page, as the real dialog does, until the user or an agent answers in Hatch.
contextBridge.exposeInMainWorld('__hatchDialog', (kind: unknown, message: unknown, fallback: unknown): { accept: boolean; text: string } =>
  ipcRenderer.sendSync('guest:dialog', String(kind), String(message ?? ''), String(fallback ?? '')),
);
void webFrame.executeJavaScript(`(() => {
  const ask = window.__hatchDialog;
  window.alert = (m) => { ask('alert', m === undefined ? '' : m, ''); };
  window.confirm = (m) => ask('confirm', m === undefined ? '' : m, '').accept;
  window.prompt = (m, d) => { const r = ask('prompt', m === undefined ? '' : m, d === undefined ? '' : d); return r.accept ? r.text : null; };
})();`);

// Tells Hatch the page changed, so the agent view on screen stays current. One message per burst of changes.
let timer: ReturnType<typeof setTimeout> | null = null;
const report = (): void => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    ipcRenderer.send('guest:mutated');
  }, 300);
};
window.addEventListener('DOMContentLoaded', () => {
  new MutationObserver(report).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener('input', report, true);
});

// ---- Comments and picking. Hatch draws pins and highlights in its own layer, and this script tells it where the elements sit.

interface Box { x: number; y: number; w: number; h: number }
const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

let tracked: { id: string; anchor: Anchor; el: Element | null }[] = [];
let rectTimer: ReturnType<typeof setTimeout> | null = null;

function sendRects(): void {
  rectTimer = null;
  const rects: Record<string, Box | null> = {};
  for (const t of tracked) {
    if (!t.el?.isConnected) t.el = resolveAnchor(t.anchor);
    rects[t.id] = t.el ? boxOf(t.el) : null;
  }
  ipcRenderer.sendToHost('hatch:rects', rects);
}
// A timer paces the reports. requestAnimationFrame stops while the Hatch window sits in the background, and pins must stay right for the moment it returns.
const queueRects = (): void => {
  if (tracked.length && !rectTimer) rectTimer = setTimeout(sendRects, 16);
};

ipcRenderer.on('hatch:track', (_e, anchors: { id: string; anchor: Anchor }[]) => {
  tracked = anchors.map((a) => ({ ...a, el: null }));
  if (document.readyState === 'loading') return;
  sendRects();
});

/** The host sends the pointer's place in the page. `take` means the user clicked. */
ipcRenderer.on('hatch:pick', (_e, point: { x: number; y: number; take: boolean; purpose?: 'comment' | 'grab' }) => {
  const el = document.elementFromPoint(point.x, point.y);
  if (!el) return ipcRenderer.sendToHost('hatch:picked', null);
  if (point.take && point.purpose === 'grab') {
    const { label } = describeElement(el);
    return void serialiseForPaper(el).then(
      ({ html, elements }) => ipcRenderer.sendToHost('hatch:grabbed', { html, elements, label }),
      (error: unknown) => ipcRenderer.sendToHost('hatch:grabbed', { error: error instanceof Error ? error.message : 'Hatch could not copy that element.', label }),
    );
  }
  ipcRenderer.sendToHost('hatch:picked', { rect: boxOf(el), take: point.take, ...describeElement(el) });
});

/** The main process marks an element an agent named by reference, and this script describes it. */
ipcRenderer.on('hatch:ask', (_e, requestId: string, kind: string, payload: unknown) => {
  let answer: unknown = null;
  // An agent's grab_element and get_css act on the element the main process marked.
  if (kind === 'grab-marked' || kind === 'css-marked') {
    const el = document.querySelector(`[data-hatch-mark="${String(payload)}"]`);
    el?.removeAttribute('data-hatch-mark');
    if (!el) return ipcRenderer.send('guest:answer', requestId, { error: 'The element has left the page, or it sits inside a web component, which this tool cannot reach.' });
    if (kind === 'css-marked') return ipcRenderer.send('guest:answer', requestId, { css: cssBlockOf(el) });
    return void serialiseForPaper(el).then(
      ({ html, elements }) => ipcRenderer.send('guest:answer', requestId, { html, elements, label: describeElement(el).label }),
      (error: unknown) => ipcRenderer.send('guest:answer', requestId, { error: error instanceof Error ? error.message : 'Hatch could not copy that element.' }),
    );
  }
  if (kind === 'describe-marked') {
    const el = document.querySelector(`[data-hatch-mark="${String(payload)}"]`);
    el?.removeAttribute('data-hatch-mark');
    answer = el ? describeElement(el) : null;
  } else if (kind === 'locate') {
    // Marks each anchor's element so the main process can turn it into an agent-view reference.
    answer = (payload as { id: string; anchor: Anchor }[]).map(({ id, anchor }) => {
      const el = resolveAnchor(anchor);
      el?.setAttribute('data-hatch-found', id);
      return { id, found: !!el };
    });
  } else if (kind === 'unmark') {
    document.querySelectorAll('[data-hatch-found]').forEach((el) => el.removeAttribute('data-hatch-found'));
  }
  ipcRenderer.send('guest:answer', requestId, answer);
});

window.addEventListener('scroll', queueRects, { capture: true, passive: true });
window.addEventListener('resize', queueRects);
window.addEventListener('load', queueRects);
window.addEventListener('DOMContentLoaded', () => {
  new MutationObserver(queueRects).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  if (tracked.length) sendRects();
});
