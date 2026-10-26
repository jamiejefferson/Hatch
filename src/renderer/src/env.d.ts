import type { HatchApi } from '../../preload/api';

declare global {
  interface Window {
    hatch: HatchApi;
  }

  /** The parts of Electron's <webview> element that Hatch uses. */
  interface WebviewElement extends HTMLElement {
    src: string;
    getWebContentsId(): number;
    getURL(): string;
    getTitle(): string;
    loadURL(url: string): Promise<void>;
    reload(): void;
    stop(): void;
    goBack(): void;
    goForward(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
    isLoading(): boolean;
    openDevTools(): void;
    setAudioMuted(muted: boolean): void;
    /** Hands the page an input event as if it came from the user, such as a scroll the canvas passes on. */
    sendInputEvent(event: { type: 'mouseWheel'; x: number; y: number; deltaX: number; deltaY: number; canScroll?: boolean; hasPreciseScrollingDeltas?: boolean }): void;
    /** Sends a message to the script Hatch runs inside the page. */
    send(channel: string, ...args: unknown[]): Promise<void>;
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<WebviewElement>, WebviewElement> & { src?: string; partition?: string; webpreferences?: string };
    }
  }
}

export {};
