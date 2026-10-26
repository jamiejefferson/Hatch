import { useEffect, useRef, useState } from 'react';

/** How long the pointer rests on a control before its tip shows, and how long after one tip closes the next shows at once. */
const REST_MS = 450;
const WARM_MS = 400;

interface Tip {
  label: string;
  detail: string | null;
  keys: string[];
  box: DOMRect;
  /** The vertical toolbar puts its tips to the right of the button, every other control below it. */
  side: 'below' | 'right';
}

/**
 * One tooltip for the whole interface. A control names itself with `title`, which this takes over so the Mac's plain tooltip never shows,
 * and may add `data-detail`, a sentence on what it does, and `data-keys`, its shortcut, such as "⌘N" or "⌥⌘←" (several separated by spaces).
 */
export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closedAt = 0;

    const read = (el: HTMLElement): Tip => {
      // The interface's own title moves to data-tip each time React writes it, so the native tooltip never competes.
      const title = el.getAttribute('title');
      if (title !== null) {
        el.dataset.tip = title;
        el.removeAttribute('title');
        // A control named by its title alone keeps that name for screen readers.
        if (el.dataset.tipNames === '1' || (!el.hasAttribute('aria-label') && !el.textContent?.trim())) {
          el.setAttribute('aria-label', title);
          el.dataset.tipNames = '1';
        }
      }
      return {
        label: el.dataset.tip ?? '',
        detail: el.dataset.detail ?? null,
        keys: (el.dataset.keys ?? '').split(' ').filter(Boolean),
        box: el.getBoundingClientRect(),
        side: el.closest('.toolbar') ? 'right' : 'below',
      };
    };
    const hide = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (target) closedAt = Date.now();
      target = null;
      setTip(null);
    };
    const onMove = (e: PointerEvent): void => {
      // A disabled button sends no pointer events of its own, so the element under the pointer is asked for directly.
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const el = under?.closest<HTMLElement>('[title], [data-tip]') ?? null;
      if (el === target) return;
      const warm = target !== null || Date.now() - closedAt < WARM_MS;
      hide();
      if (!el || el.closest('.tooltip') || el.matches('webview, input, textarea')) return;
      target = el;
      // The title comes off at once, before the Mac's own tooltip has time to show.
      read(el);
      timer = setTimeout(() => target === el && el.isConnected && setTip(read(el)), warm ? 0 : REST_MS);
    };
    const onLeave = (e: PointerEvent): void => {
      if (!e.relatedTarget) hide();
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('wheel', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      hide();
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('blur', hide);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  // The tip measures itself once drawn, then stays inside the window.
  useEffect(() => {
    const el = ref.current;
    if (!tip || !el) return setPlace(null);
    const { width, height } = el.getBoundingClientRect();
    const gap = 8;
    const { box } = tip;
    let left = tip.side === 'right' ? box.right + gap : box.left + box.width / 2 - width / 2;
    let top = tip.side === 'right' ? box.top + box.height / 2 - height / 2 : box.bottom + gap;
    if (top + height > window.innerHeight - gap) top = box.top - height - gap;
    left = Math.min(Math.max(left, gap), window.innerWidth - width - gap);
    top = Math.max(top, gap);
    setPlace({ left, top });
  }, [tip]);

  if (!tip || !tip.label) return null;
  return (
    <div ref={ref} className="tooltip" role="tooltip" style={place ?? { left: -9999, top: -9999 }} data-testid="tooltip">
      <div className="tooltip-head">
        <span className="tooltip-label">{tip.label}</span>
        {tip.keys.length > 0 && (
          <span className="tooltip-keys" data-testid="tooltip-keys">
            {tip.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </span>
        )}
      </div>
      {tip.detail && <p className="tooltip-detail">{tip.detail}</p>}
    </div>
  );
}
