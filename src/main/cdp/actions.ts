// What an agent does to a page. Each action resolves a reference to a live element, works on it, and reports what happened.
import { hatchAddress } from '@shared/project-address';
import { getProxyPort, projectsState } from '../servers/manager';
import { HatchError, type PageSession } from './session';
import { buildOutline, findInOutline, renderOutline, type AxNode, type OutlineLine } from './snapshot';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function outlineOf(page: PageSession, rootRef?: string): Promise<OutlineLine[]> {
  ensureNoDialog(page);
  const rootBackendNodeId = rootRef ? nodeFor(page, rootRef) : undefined;
  const { nodes } = await page.send<{ nodes: AxNode[] }>('Accessibility.getFullAXTree', {}, 15000);
  const address = await addressOf(page);
  const build = (root: number | undefined): OutlineLine[] => buildOutline(nodes, { title: page.guest.getTitle(), address, refFor: (id) => page.refs.refFor(id), rootBackendNodeId: root, redactValues: page.tainted });
  const lines = build(rootBackendNodeId);
  if (rootBackendNodeId === undefined || lines.length > 0) return lines;

  // A reference can name an element the outline has no line for, such as a plain <div> a comment points at.
  // An empty answer would read as an empty page, so the outline climbs to the nearest container that has lines and says so.
  let climbing: number | undefined = rootBackendNodeId;
  for (let step = 0; step < 15 && climbing !== undefined; step += 1) {
    climbing = await parentOf(page, climbing);
    const above = climbing === undefined ? [] : build(climbing);
    if (above.length > 0) return [{ depth: 0, text: `(The element ${rootRef} carries no lines of its own in the agent view. This is its nearest container, ${page.refs.refFor(climbing!)}. get_element ${rootRef} measures the element itself.)` }, ...above];
  }
  throw new HatchError(`The element ${rootRef} and its containers carry no lines in the agent view, so it holds nothing to read or act on. get_element ${rootRef} measures it, and screenshot ${rootRef} shows it.`);
}

async function parentOf(page: PageSession, backendNodeId: number): Promise<number | undefined> {
  try {
    const { object } = await page.send<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId });
    const parent = await page.send<{ result: { objectId?: string } }>('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return this.parentElement || (this.getRootNode && this.getRootNode().host) || null; }' });
    if (!parent.result.objectId) return undefined;
    return (await page.send<{ node: { backendNodeId: number } }>('DOM.describeNode', { objectId: parent.result.objectId })).node.backendNodeId;
  } catch {
    return undefined;
  }
}

/** A project page reads as hatch:name/path, which is the form people use for it. */
export async function addressOf(page: PageSession): Promise<string> {
  const url = page.guest.getURL();
  return hatchAddress(url, (await projectsState(false)).projects, getProxyPort()) ?? url;
}

export const snapshot = async (page: PageSession, rootRef?: string, maxChars?: number): Promise<string> => renderOutline(await outlineOf(page, rootRef), maxChars);
/** Repeated components read the same in the outline, so each match carries its place on the page: top-left corner and size, in page pixels. */
export async function find(page: PageSession, query: string): Promise<string> {
  const found = findInOutline(await outlineOf(page), query);
  const scroll = await page.evaluate<{ x: number; y: number }>('({ x: scrollX, y: scrollY })', 3000).catch(() => ({ x: 0, y: 0 }));
  const lines = await Promise.all(
    found.split('\n').map(async (line) => {
      const reference = line.match(/\[(e\d+)\]/)?.[1];
      const backendNodeId = reference ? page.refs.nodeFor(reference) : undefined;
      if (backendNodeId === undefined) return line;
      try {
        const { model } = await page.send<{ model: { border: number[]; width: number; height: number } }>('DOM.getBoxModel', { backendNodeId });
        const place = `at ${Math.round(model.border[0]! + scroll.x)},${Math.round(model.border[1]! + scroll.y)}  ${Math.round(model.width)} × ${Math.round(model.height)}`;
        const [head, path] = line.split(/ {4}(?=in )/);
        return path ? `${head}    ${place}    ${path}` : `${line}    ${place}`;
      } catch {
        // An element with no box, such as one inside a closed menu, keeps its line as it is.
        return line;
      }
    }),
  );
  return lines.join('\n');
}

export function ensureNoDialog(page: PageSession): void {
  if (page.dialog) throw new HatchError(`The page is showing a ${page.dialog.kind} dialog: ${JSON.stringify(page.dialog.message)}. Answer it with handle_dialog before anything else.`);
}

function nodeFor(page: PageSession, ref: string): number {
  const id = page.refs.nodeFor(ref);
  if (id === undefined) throw new HatchError(`No element has the reference ${ref} on this page. References clear when the page navigates. Call snapshot and use a reference from the new outline.`);
  return id;
}

async function objectFor(page: PageSession, ref: string): Promise<string> {
  const backendNodeId = nodeFor(page, ref);
  try {
    const { object } = await page.send<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId });
    return object.objectId;
  } catch (e) {
    if (e instanceof HatchError) throw e;
    throw new HatchError(`The element ${ref} has left the page. Call snapshot and use a reference from the new outline.`);
  }
}

async function call<T>(page: PageSession, objectId: string, fn: string, args: unknown[] = []): Promise<T> {
  const r = await page.send<{ result: { value: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: fn,
    arguments: args.map((value) => ({ value })),
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new HatchError(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

interface Target { x: number; y: number; visible: boolean; covered: string | null }

/** Scrolls the element into view and reports its centre, and what covers it if anything does. */
const LOCATE = `function () {
  const el = this.nodeType === 1 ? this : this.parentElement;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  // elementFromPoint stops at a shadow host, so the lookup descends into each shadow root, and "contains" climbs through hosts.
  let hit = document.elementFromPoint(x, y);
  for (let inner; hit && hit.shadowRoot && (inner = hit.shadowRoot.elementFromPoint(x, y)) && inner !== hit; ) hit = inner;
  const within = (outer, n) => { for (; n; n = n.parentNode || n.host) if (n === outer) return true; return false; };
  const mine = hit && (within(el, hit) || within(hit, el) || (hit.closest('label') && hit.closest('label').control === el) || (el.labels && [...el.labels].some((l) => l.contains(hit))));
  const describe = (n) => n ? '<' + n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + '>' : 'nothing';
  return { x, y, visible: r.width > 0 && r.height > 0, covered: mine ? null : describe(hit) };
}`;

async function locate(page: PageSession, ref: string, action: string): Promise<Target> {
  const target = await call<Target>(page, await objectFor(page, ref), LOCATE);
  if (!target.visible) throw new HatchError(`The element ${ref} has no size on the page, so Hatch cannot ${action} it. It may be hidden.`);
  if (target.covered) throw new HatchError(`Another element covers ${ref}: ${target.covered}. Close or scroll past what covers it, then call snapshot again.`);
  return target;
}

/** A click can open a dialog, and the page then holds the mouse event until someone answers. The race keeps the agent moving. */
async function settle(page: PageSession, work: Promise<unknown>): Promise<void> {
  let off = (): void => {};
  const dialog = new Promise<void>((resolve) => {
    off = page.onDialog(() => page.dialog && resolve());
  });
  await Promise.race([work.catch(() => {}), dialog]);
  off();
}

async function afterAction(page: PageSession, before: string): Promise<string> {
  await sleep(250);
  if (page.dialog) return ` The page opened a ${page.dialog.kind} dialog: ${JSON.stringify(page.dialog.message)}. Answer it with handle_dialog.`;
  if (page.loading) await waitForLoad(page, 10_000);
  const now = page.guest.getURL();
  return now !== before ? ` The page is now ${await addressOf(page)} (${JSON.stringify(page.guest.getTitle())}). Earlier references no longer apply.` : '';
}

export function waitForLoad(page: PageSession, timeoutMs: number): Promise<boolean> {
  if (!page.loading) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean): void => {
      clearTimeout(timer);
      off();
      resolve(ok);
    };
    const off = page.onChanged(() => !page.loading && done(true));
    const timer = setTimeout(() => done(false), timeoutMs);
  });
}

export async function click(page: PageSession, ref: string, options: { double?: boolean } = {}): Promise<string> {
  ensureNoDialog(page);
  const { x, y } = await locate(page, ref, 'click');
  const before = page.guest.getURL();
  const base = { x, y, button: 'left', clickCount: options.double ? 2 : 1 };
  const work = (async (): Promise<void> => {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  })();
  await settle(page, work);
  return `Clicked ${ref}.${await afterAction(page, before)}`;
}

export async function hover(page: PageSession, ref: string): Promise<string> {
  ensureNoDialog(page);
  const { x, y } = await locate(page, ref, 'hover over');
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  return `The pointer rests on ${ref}.`;
}

const PREPARE_FILL = `function () {
  if (this.disabled || this.readOnly) return 'locked';
  this.focus();
  if (typeof this.select === 'function') this.select();
  else if (this.isContentEditable) { const s = getSelection(); s.selectAllChildren(this); }
  else return 'not-a-field';
  return document.activeElement === this || this.isContentEditable ? 'ok' : 'no-focus';
}`;

const HOLDS = `function (text) {
  const now = 'value' in this ? this.value : this.textContent;
  return text === '' ? now === '' : String(now).includes(text);
}`;

// The last resort for a field that took no typed text. The prototype setter reaches fields that React and Vue control.
const SET_VALUE = `function (text) {
  if (!('value' in this)) return false;
  const proto = this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(this, text);
  this.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  this.dispatchEvent(new Event('change', { bubbles: true }));
  return this.value === text;
}`;

export async function fill(page: PageSession, ref: string, text: string): Promise<string> {
  ensureNoDialog(page);
  const { x, y } = await locate(page, ref, 'fill');
  // The click puts the caret in the field the way a person does, which also fires the focus handlers some forms rely on.
  const base = { x, y, button: 'left', clickCount: 1 };
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  const state = await call<string>(page, await objectFor(page, ref), PREPARE_FILL);
  if (state === 'locked') throw new HatchError(`The field ${ref} is disabled or read-only.`);
  if (state === 'not-a-field') throw new HatchError(`The element ${ref} takes no text. Use select_option for a dropdown and click for a checkbox.`);
  if (text === '') await key(page, 'Backspace');
  // insertText replaces the selection and fires the input events that framework-controlled fields listen for.
  // It goes through Electron, because Chrome drops CDP's Input.insertText for a page that lacks input focus.
  else await page.guest.insertText(text);
  const object = await objectFor(page, ref);
  if (!(await call<boolean>(page, object, HOLDS, [text])) && !(await call<boolean>(page, object, SET_VALUE, [text]))) {
    throw new HatchError(`The field ${ref} did not take the text. It may format or reject what it receives. Call snapshot to see what it holds.`);
  }
  return `Filled ${ref}.`;
}

const SELECT = `function (wanted) {
  if (this.tagName !== 'SELECT') return { error: 'not-select' };
  const options = [...this.options];
  const want = wanted.trim().toLowerCase();
  const match = options.find((o) => o.label.trim().toLowerCase() === want) || options.find((o) => o.value.toLowerCase() === want) || options.find((o) => o.label.toLowerCase().includes(want));
  if (!match) return { error: 'no-option', options: options.map((o) => o.label.trim()).slice(0, 40) };
  if (match.disabled) return { error: 'disabled' };
  this.value = match.value;
  this.dispatchEvent(new Event('input', { bubbles: true }));
  this.dispatchEvent(new Event('change', { bubbles: true }));
  return { chosen: match.label.trim() };
}`;

export async function selectOption(page: PageSession, ref: string, option: string): Promise<string> {
  ensureNoDialog(page);
  // A click on a <select> opens a native macOS menu that blocks the page, so Hatch sets the value directly.
  const r = await call<{ error?: string; options?: string[]; chosen?: string }>(page, await objectFor(page, ref), SELECT, [option]);
  if (r.error === 'not-select') throw new HatchError(`The element ${ref} is no native dropdown. Click it, call snapshot, then click the option that appears.`);
  if (r.error === 'no-option') throw new HatchError(`The dropdown ${ref} has no option ${JSON.stringify(option)}. It offers: ${(r.options ?? []).map((o) => JSON.stringify(o)).join(', ')}.`);
  if (r.error === 'disabled') throw new HatchError(`The option ${JSON.stringify(option)} is disabled.`);
  return `Chose ${JSON.stringify(r.chosen)} in ${ref}.`;
}

const KEYS: Record<string, { code: string; keyCode: number; text?: string }> = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { code: 'Tab', keyCode: 9 },
  Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 },
  Delete: { code: 'Delete', keyCode: 46 },
  ' ': { code: 'Space', keyCode: 32, text: ' ' },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  Home: { code: 'Home', keyCode: 36 },
  End: { code: 'End', keyCode: 35 },
  PageUp: { code: 'PageUp', keyCode: 33 },
  PageDown: { code: 'PageDown', keyCode: 34 },
};
const ELECTRON_KEYS: Record<string, string> = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
const ALIASES: Record<string, string> = { Esc: 'Escape', Return: 'Enter', Space: ' ', Spacebar: ' ', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', Del: 'Delete' };
const MODIFIERS: Record<string, number> = { Alt: 1, Option: 1, Control: 2, Ctrl: 2, Meta: 4, Cmd: 4, Command: 4, Shift: 8 };

async function key(page: PageSession, combo: string): Promise<void> {
  const parts = combo === '+' ? ['+'] : combo.split('+').map((p) => p.trim());
  let name = parts.pop() ?? '';
  name = ALIASES[name] ?? name;
  let modifiers = 0;
  for (const m of parts) {
    const bit = MODIFIERS[m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()];
    if (!bit) throw new HatchError(`Hatch knows no modifier called ${JSON.stringify(m)}. Use Shift, Control, Alt or Meta.`);
    modifiers |= bit;
  }
  const known = KEYS[name] ?? (/^F([1-9]|1[0-2])$/.test(name) ? { code: name, keyCode: 111 + Number(name.slice(1)) } : undefined);
  let event: { key: string; code: string; windowsVirtualKeyCode: number; text?: string };
  if (known) event = { key: name, code: known.code, windowsVirtualKeyCode: known.keyCode, text: known.text };
  else if ([...name].length === 1) {
    const upper = name.toUpperCase();
    event = { key: name, code: /[a-z]/i.test(name) ? `Key${upper}` : /\d/.test(name) ? `Digit${name}` : '', windowsVirtualKeyCode: upper.charCodeAt(0), text: name };
  } else throw new HatchError(`Hatch knows no key called ${JSON.stringify(name)}. Examples: Enter, Tab, Escape, ArrowDown, a, Meta+a, Shift+Tab.`);
  // A command chord carries no text, or the page would also type the letter.
  const text = modifiers & ~8 ? undefined : event.text;
  // Keys go through Electron. Chrome drops CDP key events for a page that lacks input focus, which is every page
  // until it receives a click, and every page again once the user clicks anywhere in Hatch's own interface.
  const keyCode = ELECTRON_KEYS[name] ?? name;
  const held = (['alt', 'control', 'meta', 'shift'] as const).filter((_m, i) => modifiers & [1, 2, 4, 8][i]!);
  page.guest.sendInputEvent({ type: 'keyDown', keyCode, modifiers: [...held] });
  if (text) page.guest.sendInputEvent({ type: 'char', keyCode, modifiers: [...held] });
  page.guest.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [...held] });
  // The events queue in the page's process. One round trip lets them land before the reply describes the result.
  // The wait stays short, because a key such as Enter can start a navigation that never answers this call.
  await page.evaluate('0', 400).catch(() => {});
}

export async function pressKey(page: PageSession, combo: string, ref?: string): Promise<string> {
  ensureNoDialog(page);
  if (ref) await call(page, await objectFor(page, ref), 'function () { this.focus(); }');
  const before = page.guest.getURL();
  await settle(page, key(page, combo));
  return `Pressed ${combo}.${await afterAction(page, before)}`;
}

export async function scroll(page: PageSession, options: { ref?: string; to?: 'top' | 'bottom'; dy?: number }): Promise<string> {
  ensureNoDialog(page);
  if (options.ref) {
    await call(page, await objectFor(page, options.ref), "function () { (this.nodeType === 1 ? this : this.parentElement).scrollIntoView({ block: 'center', behavior: 'instant' }); }");
  } else if (options.to) {
    await page.evaluate(`scrollTo({ top: ${options.to === 'top' ? 0 : 'document.documentElement.scrollHeight'}, behavior: 'instant' })`);
  } else {
    await page.evaluate(`scrollBy({ top: ${Number(options.dy ?? 600)}, behavior: 'instant' })`);
  }
  await sleep(100);
  const at = await page.evaluate<{ y: number; max: number }>('({ y: Math.round(scrollY), max: Math.round(document.documentElement.scrollHeight - innerHeight) })');
  return `The page sits at ${at.y} of ${Math.max(at.max, 0)} pixels of scroll.`;
}

export async function handleDialog(page: PageSession, accept: boolean, text?: string): Promise<string> {
  const dialog = page.dialog;
  if (!dialog) throw new HatchError('The page shows no dialog.');
  await dialog.answer(accept, text);
  page.setDialog(null);
  return `${accept ? 'Accepted' : 'Dismissed'} the ${dialog.kind} dialog.`;
}

export type WaitCondition = { text?: string; text_gone?: string; url_contains?: string };

/** Waits for a condition or for the timeout, whichever comes first, and says which one it was. */
export async function waitFor(page: PageSession, condition: WaitCondition, timeoutMs: number, tick?: (elapsedMs: number) => void): Promise<{ met: boolean; detail: string }> {
  const started = Date.now();
  const check = async (): Promise<boolean> => {
    if (page.dialog) return true;
    if (condition.url_contains && !page.guest.getURL().includes(condition.url_contains)) return false;
    if (condition.text || condition.text_gone) {
      const body = (await page.evaluate<string>("document.body ? document.body.innerText : ''", 4000).catch(() => '')).toLowerCase();
      if (condition.text && !body.includes(condition.text.toLowerCase())) return false;
      if (condition.text_gone && body.includes(condition.text_gone.toLowerCase())) return false;
    }
    return !page.loading || !!(condition.text || condition.text_gone || condition.url_contains);
  };
  for (;;) {
    if (await check()) {
      if (page.dialog) return { met: false, detail: `The page opened a ${page.dialog.kind} dialog: ${JSON.stringify(page.dialog.message)}. Answer it with handle_dialog.` };
      return { met: true, detail: `The condition holds after ${((Date.now() - started) / 1000).toFixed(1)} seconds.` };
    }
    const elapsed = Date.now() - started;
    if (elapsed >= timeoutMs) return { met: false, detail: `The condition does not hold yet after ${Math.round(elapsed / 1000)} seconds. ${page.loading ? 'The page is still loading.' : 'The page has finished loading.'} Hatch keeps the page open; call wait_for again to keep waiting.` };
    tick?.(elapsed);
    await sleep(250);
  }
}
