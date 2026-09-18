import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { actions, useStore, type SidebarPanel } from '../state/store';

interface Step {
  title: string;
  body: string;
  /** The control the step points at. With none on screen the step falls back, and with no fallback the card sits in the middle. */
  target?: string;
  fallback?: string;
  /** The panel the step needs open before it measures its target. */
  panel?: SidebarPanel;
}

const STEPS: Step[] = [
  { title: 'Open a page in a Hatch', body: 'A Hatch is a live page on the canvas. This button opens one, and so does a double tap on empty canvas.', target: '[data-testid="new-hatch"]', fallback: '[data-testid="panel-hatch"]', panel: 'hatch' },
  { title: 'Move around the canvas', body: 'Two fingers pan the canvas and a pinch zooms it. Select a Hatch to scroll its page. The bar above a selected Hatch holds back, forward and Fit to view, which fills the window with that one page.' },
  { title: 'Pin a comment to an element', body: 'Select a Hatch and this panel holds its controls. The comment tool pins a note to any element on the page. Your agent reads the note and replies with what it changed.', target: '[data-testid="panel-hatch"]' },
  { title: 'Run a local project', body: 'Projects takes a folder from your Mac. Hatch starts its dev server and gives it a short address, such as hatch:my-site.', target: '[data-testid="panel-projects"]' },
  { title: 'Connect your agent', body: 'Hatch holds no AI. Settings has one button that copies the connection, and you paste it to Claude Code or any other agent that speaks MCP.', target: '[data-testid="panel-settings"]' },
  { title: 'Tell us what you find', body: 'This icon sends feedback to the people who make Hatch. The Help menu opens this guide again.', target: '[data-testid="panel-feedback"]' },
];

const CARD_WIDTH = 320;
const EDGE = 16;
const INTRO_MS = 2300;

interface Box { left: number; top: number; width: number; height: number }

/** The guide to the interface: six cards, each beside the control it describes. It runs once, and Help > Show the Guide runs it again. */
export function Guide() {
  const open = useStore((s) => s.guideOpen);
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  // The first guide waits for the start-up sequence to leave.
  const [armed, setArmed] = useState(!window.hatch.intro);
  const card = useRef<HTMLDivElement>(null);
  const step = STEPS[index]!;

  useEffect(() => {
    if (armed) return;
    const timer = setTimeout(() => setArmed(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || !armed) return;
    if (step.panel) actions.showPanel(step.panel);
    const measure = (): void => {
      const el = (step.target && document.querySelector(step.target)) || (step.fallback && document.querySelector(step.fallback)) || null;
      const r = el?.getBoundingClientRect();
      setBox(r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
    };
    // The panel a step opens draws on the next frame.
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [open, armed, step]);

  useLayoutEffect(() => setCardHeight(card.current?.offsetHeight ?? 0), [index, box, open, armed]);

  useEffect(() => {
    if (!open || !armed) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      actions.endGuide();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, armed]);

  if (!open || !armed) return null;

  const last = index === STEPS.length - 1;
  const below = box ? box.top + box.height + 14 : 0;
  const style: React.CSSProperties = box
    ? {
        left: Math.max(EDGE, Math.min(box.left + box.width / 2 - CARD_WIDTH / 2, window.innerWidth - CARD_WIDTH - EDGE)),
        top: below + cardHeight > window.innerHeight - EDGE ? Math.max(EDGE, box.top - 14 - cardHeight) : below,
      }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="guide" data-testid="guide">
      {box ? <div className="guide-ring" style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12 }} /> : <div className="guide-scrim" />}
      <div ref={card} className="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" style={{ width: CARD_WIDTH, ...style }}>
        <p className="guide-count mono">
          {index + 1} of {STEPS.length}
        </p>
        <h1 id="guide-title">{step.title}</h1>
        <p>{step.body}</p>
        <div className="guide-actions">
          {!last && (
            <button className="text-button" onClick={actions.endGuide} data-testid="guide-skip">
              Skip the guide
            </button>
          )}
          <span className="header-space" />
          {index > 0 && (
            <button className="button" onClick={() => setIndex(index - 1)}>
              Back
            </button>
          )}
          <button className="button primary" autoFocus onClick={() => (last ? actions.endGuide() : setIndex(index + 1))} data-testid="guide-next">
            {last ? 'Start using Hatch' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
