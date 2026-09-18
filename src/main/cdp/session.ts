// One CDP session per live page. Every call carries a hang guard, so a frozen page returns an error instead of stalling an agent.
import type { WebContents } from 'electron';
import { RefTable } from './refs';

export interface ConsoleEntry { time: number; level: string; text: string; url?: string; line?: number }
export interface NetworkEntry { time: number; id: string; method: string; url: string; type?: string; status?: number; failed?: string; ms?: number }
export interface OpenDialog {
  kind: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  defaultText: string;
  /** True for a dialog Chrome reported, which happens inside an iframe. The preload stand-ins carry the rest. */
  viaCdp?: boolean;
  /** Settles the dialog. The prompt stand-in and CDP dialogs settle differently, so each one brings its own. */
  answer(accept: boolean, text?: string): Promise<void>;
}

const BUFFER = 200;
const push = <T>(list: T[], item: T): void => {
  list.push(item);
  if (list.length > BUFFER) list.shift();
};

export class HatchError extends Error {}

type Listener = () => void;

export class PageSession {
  readonly refs = new RefTable();
  readonly console: ConsoleEntry[] = [];
  readonly network: NetworkEntry[] = [];
  dialog: OpenDialog | null = null;
  loading = false;
  /** Set after Hatch fills a saved sign-in. It blocks page scripting by agents until the next navigation. */
  tainted = false;
  private readonly pending = new Map<string, NetworkEntry>();
  private readonly changed = new Set<Listener>();
  private readonly dialogs = new Set<Listener>();
  private attached = false;

  constructor(readonly hatchId: string, readonly guest: WebContents) {
    guest.debugger.on('message', (_e, method, params) => this.onEvent(method, params));
    guest.debugger.on('detach', () => {
      this.attached = false;
    });
    guest.on('did-start-loading', () => {
      this.loading = true;
    });
    guest.on('did-stop-loading', () => {
      this.loading = false;
      this.emitChanged();
    });
  }

  /** Fires after a navigation, a load or a DOM change. The agent view panel and wait_for both listen. */
  onChanged(listener: Listener): () => void {
    this.changed.add(listener);
    return () => this.changed.delete(listener);
  }
  onDialog(listener: Listener): () => void {
    this.dialogs.add(listener);
    return () => this.dialogs.delete(listener);
  }
  emitChanged(): void {
    this.changed.forEach((l) => l());
  }
  setDialog(dialog: OpenDialog | null): void {
    this.dialog = dialog;
    this.dialogs.forEach((l) => l());
  }

  async attach(): Promise<void> {
    if (this.attached || this.guest.isDestroyed()) return;
    try {
      this.guest.debugger.attach('1.3');
    } catch {
      throw new HatchError('DevTools is open on this Hatch, so an agent cannot drive it. Close the DevTools window and try again.');
    }
    this.attached = true;
    await Promise.all([
      this.send('Page.enable'),
      this.send('Runtime.enable'),
      this.send('DOM.enable'),
      this.send('Network.enable'),
      this.send('Log.enable'),
      // The Hatch window usually sits behind the app the user talks to the agent in.
      this.send('Emulation.setFocusEmulationEnabled', { enabled: true }),
    ]);
  }

  async send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>, timeoutMs = 8000): Promise<T> {
    if (this.guest.isDestroyed()) throw new HatchError('That Hatch has closed.');
    if (!this.attached && method !== 'Page.enable') await this.attach();
    let timer: NodeJS.Timeout | undefined;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HatchError(`The page did not answer within ${timeoutMs / 1000} seconds (${method}). It may be frozen or showing a dialog.`)), timeoutMs);
    });
    try {
      return (await Promise.race([this.guest.debugger.sendCommand(method, params), guard])) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Runs an expression in the page and returns its value. */
  async evaluate<T>(expression: string, timeoutMs?: number): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true, userGesture: true },
      timeoutMs,
    );
    if (r.exceptionDetails) throw new HatchError(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  // CDP events arrive untyped; each case names the fields it reads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onEvent(method: string, p: any): void {
    switch (method) {
      case 'Page.frameNavigated': {
        const frame = p.frame as { parentId?: string };
        if (frame.parentId) return;
        // A new document invalidates every reference, and ends the block that follows a sign-in fill.
        this.refs.clear();
        this.tainted = false;
        this.emitChanged();
        return;
      }
      case 'Page.javascriptDialogOpening': {
        const { type, message, defaultPrompt } = p as { type: OpenDialog['kind']; message: string; defaultPrompt?: string };
        this.setDialog({
          kind: type,
          message,
          defaultText: defaultPrompt ?? '',
          viaCdp: true,
          answer: async (accept, text) => {
            await this.send('Page.handleJavaScriptDialog', { accept, promptText: text ?? '' });
          },
        });
        return;
      }
      case 'Page.javascriptDialogClosed':
        if (this.dialog?.viaCdp) this.setDialog(null);
        return;
      case 'Runtime.consoleAPICalled': {
        const { type, args, stackTrace } = p as { type: string; args: { value?: unknown; description?: string }[]; stackTrace?: { callFrames: { url: string; lineNumber: number }[] } };
        const text = args.map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description ?? ''))).join(' ');
        const top = stackTrace?.callFrames[0];
        push(this.console, { time: Date.now(), level: type === 'warning' ? 'warn' : type, text, url: top?.url, line: top ? top.lineNumber + 1 : undefined });
        return;
      }
      case 'Runtime.exceptionThrown': {
        const d = (p as { exceptionDetails: { text: string; url?: string; lineNumber?: number; exception?: { description?: string } } }).exceptionDetails;
        push(this.console, { time: Date.now(), level: 'error', text: d.exception?.description ?? d.text, url: d.url, line: d.lineNumber !== undefined ? d.lineNumber + 1 : undefined });
        return;
      }
      case 'Log.entryAdded': {
        const e = (p as { entry: { level: string; text: string; url?: string; lineNumber?: number } }).entry;
        push(this.console, { time: Date.now(), level: e.level === 'warning' ? 'warn' : e.level, text: e.text, url: e.url, line: e.lineNumber });
        return;
      }
      case 'Network.requestWillBeSent': {
        const { requestId, request, type } = p as { requestId: string; request: { method: string; url: string }; type?: string };
        if (request.url.startsWith('data:')) return;
        const entry: NetworkEntry = { time: Date.now(), id: requestId, method: request.method, url: request.url, type };
        this.pending.set(requestId, entry);
        push(this.network, entry);
        return;
      }
      case 'Network.responseReceived': {
        const { requestId, response } = p as { requestId: string; response: { status: number } };
        const entry = this.pending.get(requestId);
        if (entry) entry.status = response.status;
        return;
      }
      case 'Network.loadingFinished':
      case 'Network.loadingFailed': {
        const { requestId, errorText } = p as { requestId: string; errorText?: string };
        const entry = this.pending.get(requestId);
        if (!entry) return;
        entry.ms = Date.now() - entry.time;
        if (method === 'Network.loadingFailed') entry.failed = errorText ?? 'failed';
        this.pending.delete(requestId);
        return;
      }
    }
  }
}
