// Turns Chrome's accessibility tree into the agent view: a compact indented outline with a reference on every element an agent can act on.
// Pure code with no Electron imports, so recorded trees test it.

export interface AxValue { type?: string; value?: unknown }
export interface AxNode {
  nodeId: string;
  ignored?: boolean;
  role?: AxValue;
  name?: AxValue;
  value?: AxValue;
  description?: AxValue;
  properties?: { name: string; value: AxValue }[];
  childIds?: string[];
  parentId?: string;
  backendDOMNodeId?: number;
}

export interface OutlineOptions {
  title: string;
  address: string;
  refFor(backendNodeId: number): string;
  /** Start the outline at this element. */
  rootBackendNodeId?: number;
  maxChars?: number;
  /** After Hatch fills a sign-in, field values stay out of the outline. */
  redactValues?: boolean;
}

export interface OutlineLine { depth: number; text: string; ref?: string }

const ACTIONABLE = new Set([
  'link', 'button', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'treeitem', 'PopUpButton', 'DisclosureTriangle', 'ColorWell', 'Date', 'DateTime', 'InputTime',
]);
/** Containers worth a line of their own. Everything else passes its children up a level. */
const STRUCTURE = new Set([
  'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'form', 'search', 'region', 'dialog', 'alertdialog', 'alert', 'status',
  'radiogroup', 'toolbar', 'menu', 'menubar', 'tablist', 'tabpanel', 'article', 'figure', 'table', 'row', 'list', 'tree', 'grid',
]);
const NAMED_ONLY = new Set(['group', 'region', 'form', 'list', 'figure', 'article', 'Section']);
const LEAF_WITH_NAME = new Set(['heading', 'img', 'image', 'cell', 'gridcell', 'columnheader', 'rowheader', 'code', 'blockquote', 'listitem', 'Iframe', 'IframePresentational', 'progressbar', 'meter']);
const SKIP = new Set(['InlineTextBox', 'LineBreak', 'ListMarker', 'none', 'presentation']);
const ROLE_NAMES: Record<string, string> = { PopUpButton: 'combobox', DisclosureTriangle: 'button', image: 'img', Iframe: 'iframe', IframePresentational: 'iframe', ColorWell: 'colour-picker', Date: 'date', DateTime: 'date-time', InputTime: 'time' };

const str = (v?: AxValue): string => (v?.value === undefined || v.value === null ? '' : String(v.value));
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const quote = (s: string, max = 160): string => {
  const c = clean(s);
  return JSON.stringify(c.length > max ? `${c.slice(0, max - 1)}…` : c);
};

export function buildOutline(nodes: AxNode[], options: OutlineOptions): OutlineLine[] {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const root = options.rootBackendNodeId !== undefined ? (nodes.find((n) => n.backendDOMNodeId === options.rootBackendNodeId && !n.ignored) ?? nodes.find((n) => n.backendDOMNodeId === options.rootBackendNodeId)) : nodes.find((n) => !n.parentId) ?? nodes[0];
  const lines: OutlineLine[] = [];
  if (!root) return lines;

  // A visible label repeats the name of the field it labels, so the outline keeps the field and drops the label text.
  const controlNames = new Set(nodes.filter((n) => !n.ignored && ACTIONABLE.has(str(n.role))).map((n) => clean(str(n.name))).filter(Boolean));
  const MAX_OPTIONS = 20;

  const prop = (n: AxNode, name: string): unknown => n.properties?.find((p) => p.name === name)?.value.value;

  const states = (n: AxNode, role: string): string => {
    const out: string[] = [];
    const checked = prop(n, 'checked');
    if (checked === 'true' || checked === true) out.push('checked');
    if (checked === 'mixed') out.push('mixed');
    const pressed = prop(n, 'pressed');
    if (pressed === 'true' || pressed === true) out.push('pressed');
    if (prop(n, 'selected') === true) out.push('selected');
    const expanded = prop(n, 'expanded');
    if (expanded === true) out.push('expanded');
    if (expanded === false) out.push('collapsed');
    if (prop(n, 'disabled') === true) out.push('disabled');
    if (prop(n, 'required') === true) out.push('required');
    if (prop(n, 'invalid') && prop(n, 'invalid') !== 'false') out.push('invalid');
    if (prop(n, 'readonly') === true && role === 'textbox') out.push('read-only');
    return out.map((s) => ` (${s})`).join('');
  };

  // Every line carries a reference, so an agent can screenshot, read or comment on a heading or a paragraph as well as a control.
  // A text line takes its element's reference, because the text node itself has no box to act on.
  const tag = (dom: number | undefined): { mark: string; ref?: string } => {
    if (dom === undefined) return { mark: '' };
    const ref = options.refFor(dom);
    return { mark: ` [${ref}]`, ref };
  };

  const visit = (n: AxNode, depth: number, parentName: string, inLabel = false, parentDom?: number): void => {
    const kids = (n.childIds ?? []).map((id) => byId.get(id)).filter((k): k is AxNode => !!k);
    const role = str(n.role);
    if (n.ignored || SKIP.has(role)) return kids.forEach((k) => visit(k, depth, parentName, inLabel, parentDom));
    if (role === 'LabelText') return kids.forEach((k) => visit(k, depth, parentName, true, n.backendDOMNodeId ?? parentDom));

    const name = clean(str(n.name));
    if (role === 'StaticText') {
      // A button or a heading already carries its text as its name.
      if (name && !parentName.includes(name) && !(inLabel && controlNames.has(name))) lines.push({ depth, text: `text ${quote(name, 400)}${tag(parentDom).mark}`, ref: tag(parentDom).ref });
      return;
    }
    if (role === 'MenuListPopup') {
      // A native dropdown's options take no click, because macOS draws them in a menu of its own. select_option chooses one by label.
      const options = kids.filter((k) => !k.ignored);
      for (const o of options.slice(0, MAX_OPTIONS)) lines.push({ depth, text: `option ${quote(str(o.name))}${prop(o, 'selected') === true ? ' (selected)' : ''}` });
      if (options.length > MAX_OPTIONS) lines.push({ depth, text: `… ${options.length - MAX_OPTIONS} more options. select_option takes any of them by label.` });
      return;
    }

    const label = ROLE_NAMES[role] ?? role;
    const actionable = ACTIONABLE.has(role) || (prop(n, 'focusable') === true && role !== 'RootWebArea' && role !== 'generic' && !STRUCTURE.has(role) && n.backendDOMNodeId !== undefined && role !== 'Iframe');
    let line: OutlineLine | null = null;

    if (actionable && n.backendDOMNodeId !== undefined) {
      const ref = options.refFor(n.backendDOMNodeId);
      let text = `${label}${name ? ` ${quote(name)}` : ''} [${ref}]${states(n, role)}`;
      const value = clean(str(n.value));
      if (value && value !== name && role !== 'link') text += `  value ${options.redactValues ? '"•••"' : quote(value, 80)}`;
      line = { depth, text, ref };
    } else if (role === 'heading') {
      line = { depth, text: `${`heading ${prop(n, 'level') ?? ''} ${quote(name)}`.replace('  ', ' ')}${tag(n.backendDOMNodeId).mark}`, ref: tag(n.backendDOMNodeId).ref };
    } else if (role === 'Iframe' || role === 'IframePresentational') {
      line = { depth, text: `iframe${name ? ` ${quote(name)}` : ''}${tag(n.backendDOMNodeId).mark} (not expanded)`, ref: tag(n.backendDOMNodeId).ref };
    } else if (LEAF_WITH_NAME.has(role)) {
      if (name && role !== 'listitem') line = { depth, text: `${label} ${quote(name)}${tag(n.backendDOMNodeId).mark}`, ref: tag(n.backendDOMNodeId).ref };
    } else if (STRUCTURE.has(role) || NAMED_ONLY.has(role)) {
      if (name || !NAMED_ONLY.has(role)) line = { depth, text: `${label}${name ? ` ${quote(name)}` : ''}${tag(n.backendDOMNodeId).mark}${states(n, role)}`, ref: tag(n.backendDOMNodeId).ref };
    }

    if (line) lines.push(line);
    // A named leaf such as a heading or a button says everything its text children would say.
    const nextParentName = line && name ? name : parentName;
    const childDepth = line ? depth + 1 : depth;
    const before = lines.length;
    // A field's text children repeat its value, and after a sign-in fill they would show what the value line hides.
    const isField = role === 'textbox' || role === 'searchbox' || role === 'spinbutton';
    if (isField && (options.redactValues || clean(str(n.value)))) return;
    kids.forEach((k) => visit(k, childDepth, nextParentName, inLabel, n.backendDOMNodeId ?? parentDom));
    // An empty list or row adds nothing.
    if (line && !actionable && lines.length === before && !name && (role === 'list' || role === 'row' || role === 'table')) lines.pop();
  };

  if (options.rootBackendNodeId === undefined) {
    lines.push({ depth: 0, text: `page ${quote(options.title)}  ${options.address}` });
    visit(root, 1, '');
  } else {
    visit(root, 0, '');
  }
  return lines;
}

export function renderOutline(lines: OutlineLine[], maxChars = 24000): string {
  let out = '';
  for (const [i, line] of lines.entries()) {
    const next = `${'  '.repeat(line.depth)}${line.text}\n`;
    if (out.length + next.length > maxChars) {
      return `${out}… ${lines.length - i} more lines. The outline stopped at ${maxChars} characters. Read one branch with snapshot(root_ref), or search it with find.\n`;
    }
    out += next;
  }
  return out;
}

/** Lines whose text matches every word of the query, each with the headings and containers above it. */
export function findInOutline(lines: OutlineLine[], query: string, limit = 25): string {
  const words = clean(query).toLowerCase().split(' ').filter(Boolean);
  if (words.length === 0) return 'Give find a word or a role to look for, such as "button send".';
  const hits: number[] = [];
  lines.forEach((l, i) => {
    const text = l.text.toLowerCase();
    if (words.every((w) => text.includes(w))) hits.push(i);
  });
  if (hits.length === 0) return `Nothing in the agent view matches "${query}".`;
  const out: string[] = [];
  for (const i of hits.slice(0, limit)) {
    const line = lines[i]!;
    const path: string[] = [];
    let depth = line.depth;
    for (let j = i - 1; j >= 0 && depth > 1; j -= 1) {
      const above = lines[j]!;
      if (above.depth < depth) {
        path.unshift(above.text.replace(/ \[e\d+\].*$/, ''));
        depth = above.depth;
      }
    }
    out.push(`${line.text}${path.length ? `    in ${path.join(' > ')}` : ''}`);
  }
  if (hits.length > limit) out.push(`… ${hits.length - limit} more matches. Narrow the query.`);
  return out.join('\n');
}
