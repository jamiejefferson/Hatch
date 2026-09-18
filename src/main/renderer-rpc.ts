// The interface owns the workspace, so the main process asks it for tab and Hatch changes and waits for the answer.
import { ipcMain, type WebContents } from 'electron';
import { HatchError } from './cdp/session';

let target: WebContents | null = null;
let seq = 0;
const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: NodeJS.Timeout }>();

// An agent can call in the moment Hatch starts, before the interface listens. Calls wait here until it says it does.
let markReady: () => void = () => {};
let ready = new Promise<void>((resolve) => (markReady = resolve));

export function setInterface(contents: WebContents | null): void {
  target = contents;
  ready = new Promise<void>((resolve) => (markReady = resolve));
}

export function push(channel: string, payload: unknown): void {
  if (target && !target.isDestroyed()) target.send(channel, payload);
}

export async function callInterface<T>(method: string, params?: unknown): Promise<T> {
  if (!target || target.isDestroyed()) throw new HatchError('The Hatch window is closed. Open Hatch and try again.');
  const started = await Promise.race([ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 15_000))]);
  if (!started) throw new HatchError('The Hatch window is still starting. Try again in a moment.');
  return new Promise<T>((resolve, reject) => {
    if (!target || target.isDestroyed()) return reject(new HatchError('The Hatch window is closed. Open Hatch and try again.'));
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new HatchError('The Hatch window did not answer. Try again.'));
    }, 8000);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    target.send('rpc', id, method, params);
  });
}

export function registerRpcReplies(): void {
  ipcMain.on('interface:ready', (event) => event.sender === target && markReady());
  ipcMain.on('rpc:reply', (event, id: number, ok: boolean, value: unknown) => {
    if (event.sender !== target) return;
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    clearTimeout(call.timer);
    if (ok) call.resolve(value);
    else call.reject(new HatchError(String(value)));
  });
}
