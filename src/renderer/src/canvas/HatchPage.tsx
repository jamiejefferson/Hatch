import { useEffect, useRef } from 'react';
import type { Rect } from '@shared/geometry';
import type { Hatch } from '@shared/types';
import { actions } from '../state/store';
import { markReady, registerWebview } from './webviews';

interface Props {
  hatch: Hatch;
  /** Where the page sits on the canvas, in canvas pixels. */
  rect: Rect;
  hidden: boolean;
}

/** One live page. The webview's CSS size is the page's viewport, whatever the canvas zoom. */
export function HatchPage({ hatch, rect, hidden }: Props) {
  const ref = useRef<WebviewElement>(null);
  // React must never write src again: a second write reloads the page.
  const firstUrl = useRef(hatch.url).current;
  const id = hatch.id;

  useEffect(() => {
    const page = ref.current;
    if (!page) return;
    registerWebview(id, page);

    const navState = (): void => actions.setLoad(id, { canGoBack: page.canGoBack(), canGoForward: page.canGoForward() });
    const on = <E extends Event>(name: string, handler: (e: E) => void): (() => void) => {
      page.addEventListener(name, handler as EventListener);
      return () => page.removeEventListener(name, handler as EventListener);
    };
    type Nav = Event & { url: string; isMainFrame?: boolean };
    type Fail = Event & { errorCode: number; errorDescription: string; validatedURL: string; isMainFrame: boolean };

    const off = [
      // The main process learns of the page as soon as it attaches. A dev server's first compile can hold dom-ready back for longer than open_hatch waits.
      on('did-attach', () => window.hatch.bindHatch(id, page.getWebContentsId())),
      on('dom-ready', () => {
        markReady(id);
        window.hatch.bindHatch(id, page.getWebContentsId());
        navState();
      }),
      on('did-start-loading', () => actions.setLoad(id, { loading: true })),
      on('did-stop-loading', () => {
        actions.setLoad(id, { loading: false });
        // A reload to the same title sends no page-title-updated, so the title is read here as well.
        if (page.getTitle()) actions.pageChanged(id, { title: page.getTitle() });
        navState();
      }),
      on<Nav>('did-start-navigation', (e) => {
        if (e.isMainFrame) actions.setLoad(id, { error: null });
      }),
      on<Nav>('did-navigate', (e) => {
        actions.pageChanged(id, { url: e.url, title: '' });
        navState();
      }),
      on<Nav>('did-navigate-in-page', (e) => {
        if (e.isMainFrame === false) return;
        actions.pageChanged(id, { url: e.url });
        navState();
      }),
      on<Event & { title: string }>('page-title-updated', (e) => actions.pageChanged(id, { title: e.title })),
      on<Fail>('did-fail-load', (e) => {
        // -3 means the load was replaced by another one, which is no failure.
        if (!e.isMainFrame || e.errorCode === -3) return;
        actions.setLoad(id, { loading: false, error: { code: e.errorCode, description: e.errorDescription, url: e.validatedURL } });
      }),
    ];
    return () => {
      off.forEach((f) => f());
      registerWebview(id, null);
    };
  }, [id]);

  return (
    <webview
      ref={ref}
      // Every page shares one session of its own, apart from Hatch's interface. The attribute must sit on the element before the first load:
      // the main process cannot move a guest to another session once it attaches. The name matches PAGES_PARTITION in src/main/paths.ts.
      {...({ partition: 'persist:hatch-pages' } as object)}
      src={firstUrl}
      // Without this the guest blocks window.open outright. The main process still denies every new window and loads the link in this Hatch.
      // React drops a bare boolean on this element, so the attribute goes in as a string.
      {...({ allowpopups: 'true' } as object)}
      className="hatch-page"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, ...(hidden ? { opacity: 0, pointerEvents: 'none' as const } : null) }}
    />
  );
}
