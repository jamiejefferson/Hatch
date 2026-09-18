// Finds an element's identifiers when the user or an agent comments on it, and finds the element again after the page changes.
// This one resolver serves picking, re-anchoring and pin tracking, so the three never disagree.
import type { Anchor } from '@shared/comments';

const ROLES: Record<string, string> = {
  a: 'link', button: 'button', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', img: 'image', nav: 'navigation',
  main: 'main', header: 'banner', footer: 'contentinfo', select: 'combobox', textarea: 'textbox', ul: 'list', ol: 'list', li: 'listitem', table: 'table', form: 'form',
  section: 'region', article: 'article', aside: 'complementary', dialog: 'dialog', summary: 'button',
};
const INPUT_ROLES: Record<string, string> = { checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', reset: 'button', search: 'searchbox' };

const squash = (text: string | null | undefined, max: number): string => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function roleOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  return el.getAttribute('role') || (tag === 'input' ? (INPUT_ROLES[(el as HTMLInputElement).type] ?? 'textbox') : (ROLES[tag] ?? ''));
}

function nameOf(el: Element): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  const fromIds = labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
  const label = 'labels' in el ? ((el as HTMLInputElement).labels?.[0]?.textContent ?? '') : '';
  return squash(el.getAttribute('aria-label') || fromIds || label || el.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('title') || el.textContent, 80);
}

function cssPathOf(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
    if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const tag = node.tagName.toLowerCase();
    const twins = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node!.tagName) : [];
    parts.unshift(twins.length > 1 ? `${tag}:nth-of-type(${twins.indexOf(node) + 1})` : tag);
  }
  return parts.join(' > ');
}

export function describeElement(el: Element): { anchor: Anchor; label: string } {
  const tag = el.tagName.toLowerCase();
  const anchor: Anchor = { tag, cssPath: cssPathOf(el) };
  if (el.id) anchor.id = el.id;
  const testId = el.getAttribute('data-testid') ?? el.getAttribute('data-test-id') ?? el.getAttribute('data-test');
  if (testId) anchor.testId = testId;
  const role = roleOf(el);
  const name = nameOf(el);
  if (role && name) Object.assign(anchor, { role, name });
  const text = squash(el.textContent, 80);
  if (text) anchor.text = text;
  const href = el.getAttribute('href');
  if (href) anchor.href = href;
  return { anchor, label: squash(name || text, 40) || `<${tag}${el.id ? `#${el.id}` : ''}>` };
}

const safely = <T>(find: () => T | null | undefined): T | null => {
  try {
    return find() ?? null;
  } catch {
    // A hand-edited anchor may hold a selector the page rejects.
    return null;
  }
};

/** Tries each identifier in turn: id, test id, CSS path, role and name, text, link target. */
export function resolveAnchor(a: Anchor): Element | null {
  const sameTag = (el: Element | null): Element | null => (el && el.tagName.toLowerCase() === a.tag ? el : null);
  const all = (): Element[] => [...document.getElementsByTagName(a.tag)];
  return (
    (a.id ? document.getElementById(a.id) : null) ??
    (a.testId ? safely(() => document.querySelector(`[data-testid="${CSS.escape(a.testId!)}"], [data-test-id="${CSS.escape(a.testId!)}"], [data-test="${CSS.escape(a.testId!)}"]`)) : null) ??
    safely(() => sameTag(document.querySelector(a.cssPath))) ??
    (a.role && a.name ? all().find((el) => roleOf(el) === a.role && nameOf(el) === a.name) : null) ??
    (a.text ? all().find((el) => squash(el.textContent, 80) === a.text) : null) ??
    (a.href ? safely(() => document.querySelector(`[href="${CSS.escape(a.href!)}"]`)) : null) ??
    null
  );
}
