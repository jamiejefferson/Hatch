// Turns one element into self-contained HTML for the Paper design tool: every element carries its computed styles inline,
// and images travel inside the markup. The shape follows what Paper's own Snapshot extension for Chrome writes.

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template', 'head', 'title', 'base', 'iframe', 'object', 'embed']);
const VOID_TAGS = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr']);
const MAX_ELEMENTS = 2500;
const MAX_IMAGE_BYTES = 3_000_000;

// Logical properties repeat the physical ones, and these origins follow from the size.
const noise = (name: string): boolean =>
  name.includes('-block') || name.includes('-inline') || name === 'block-size' || name === 'inline-size' || name === 'transform-origin' || name === 'perspective-origin' ||
  (name.startsWith('-webkit-') && !['-webkit-text-stroke-color', '-webkit-text-stroke-width', '-webkit-line-clamp', '-webkit-box-orient', '-webkit-background-clip', '-webkit-text-fill-color'].includes(name));

const escapeText = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttr = (s: string): string => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

export class GrabError extends Error {}

export async function serialiseForPaper(root: Element): Promise<{ html: string; elements: number }> {
  // A blank frame supplies each tag's default styles, so the output keeps only what the page's own CSS set.
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.documentElement.appendChild(frame);
  const blank = frame.contentDocument;
  const defaults = new Map<string, Map<string, string>>();
  const images = new Map<string, Promise<string>>();
  let count = 0;

  const defaultsFor = (tag: string): Map<string, string> => {
    let known = defaults.get(tag);
    if (!known) {
      known = new Map();
      if (blank) {
        const sample = blank.createElement(tag);
        blank.body.appendChild(sample);
        const cs = blank.defaultView!.getComputedStyle(sample);
        for (const name of Array.from(cs)) known.set(name, cs.getPropertyValue(name));
        sample.remove();
      }
      defaults.set(tag, known);
    }
    return known;
  };

  const inline = (url: string): Promise<string> => {
    if (url.startsWith('data:')) return Promise.resolve(url);
    const absolute = new URL(url, document.baseURI).href;
    let job = images.get(absolute);
    if (!job) {
      job = fetch(absolute)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('status'))))
        .then((blob) => (blob.size > MAX_IMAGE_BYTES ? absolute : new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => resolve(absolute);
          reader.readAsDataURL(blob);
        })))
        // An image the page may not read keeps its link, which Paper can still load for a public site.
        .catch(() => absolute);
      images.set(absolute, job);
    }
    return job;
  };

  const styleOf = async (el: Element, cs: CSSStyleDeclaration, isRoot: boolean): Promise<string> => {
    const base = defaultsFor(el.tagName.toLowerCase());
    const out: string[] = [];
    for (const name of Array.from(cs)) {
      if (noise(name)) continue;
      let value = cs.getPropertyValue(name);
      if (!value || value === base.get(name)) continue;
      if (name === 'background-image' || name === 'mask-image' || name === 'list-style-image' || name === 'border-image-source') {
        for (const match of [...value.matchAll(/url\("?([^")]+)"?\)/g)]) value = value.replace(match[1]!, await inline(match[1]!));
      }
      out.push(`${name}: ${value};`);
    }
    if (isRoot) {
      const r = el.getBoundingClientRect();
      // The measured box includes padding and border, so the root states that its width does too.
      out.push('box-sizing: border-box;', `width: ${Math.round(r.width * 100) / 100}px;`, `height: ${Math.round(r.height * 100) / 100}px;`, 'margin: 0px;', 'position: relative;', 'top: auto;', 'left: auto;', 'right: auto;', 'bottom: auto;');
    }
    return out.join(' ');
  };

  const pseudo = async (el: Element, which: '::before' | '::after'): Promise<string> => {
    const cs = getComputedStyle(el, which);
    const content = cs.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') return '';
    const base = defaultsFor('span');
    const style = Array.from(cs).filter((n) => !noise(n) && n !== 'content' && cs.getPropertyValue(n) !== base.get(n)).map((n) => `${n}: ${cs.getPropertyValue(n)};`).join(' ');
    const text = /^"(.*)"$/s.exec(content)?.[1]?.replaceAll('\\"', '"') ?? '';
    return `<span style="${escapeAttr(style)}">${escapeText(text)}</span>`;
  };

  const walk = async (el: Element, isRoot: boolean): Promise<string> => {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return '';
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return '';
    if (++count > MAX_ELEMENTS) throw new GrabError(`This element holds more than ${MAX_ELEMENTS} elements. Pick a smaller part of the page.`);
    const style = escapeAttr(await styleOf(el, cs, isRoot));

    if (el instanceof SVGSVGElement) {
      const copy = el.cloneNode(true) as SVGSVGElement;
      const r = el.getBoundingClientRect();
      copy.setAttribute('width', String(r.width));
      copy.setAttribute('height', String(r.height));
      copy.setAttribute('style', `color: ${cs.color}; fill: ${cs.fill}; stroke: ${cs.stroke};${isRoot ? '' : ` margin: ${cs.margin}; flex: ${cs.flex};`}`);
      return copy.outerHTML;
    }
    if (el instanceof HTMLImageElement) return `<img src="${escapeAttr(await inline(el.currentSrc || el.src))}" alt="${escapeAttr(el.alt)}" style="${style}">`;
    if (el instanceof HTMLCanvasElement) {
      try {
        return `<img src="${el.toDataURL()}" alt="" style="${style}">`;
      } catch {
        return `<div style="${style}"></div>`;
      }
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      // Paper draws layers, so a field becomes a box that shows what the field shows.
      const shown = el instanceof HTMLSelectElement ? (el.selectedOptions[0]?.label ?? '') : el instanceof HTMLInputElement && el.type === 'password' ? '•'.repeat(el.value.length) : el.value || el.getAttribute('placeholder') || '';
      return `<div style="${style}">${escapeText(shown)}</div>`;
    }
    if (VOID_TAGS.has(tag)) return `<${tag} style="${style}">`;

    let inner = await pseudo(el, '::before');
    const kids = el.shadowRoot ? Array.from(el.shadowRoot.childNodes) : Array.from(el.childNodes);
    for (const node of kids) {
      if (node.nodeType === Node.TEXT_NODE) inner += escapeText(node.textContent ?? '');
      else if (node instanceof Element) inner += await walk(node, false);
    }
    inner += await pseudo(el, '::after');
    const safeTag = /^[a-z][a-z0-9]*$/.test(tag) && !tag.includes('-') ? tag : 'div';
    const href = el instanceof HTMLAnchorElement && el.href ? ` href="${escapeAttr(el.href)}"` : '';
    return `<${safeTag}${href} style="${style}">${inner}</${safeTag}>`;
  };

  try {
    return { html: await walk(root, true), elements: count };
  } finally {
    frame.remove();
  }
}

/** One element's own styles as a CSS rule: every computed value that differs from a bare element of the same tag. */
export function cssBlockOf(el: Element): string {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
  document.documentElement.appendChild(frame);
  try {
    const blank = frame.contentDocument;
    const base = new Map<string, string>();
    if (blank) {
      const sample = blank.createElement(el.tagName.toLowerCase());
      blank.body.appendChild(sample);
      const bare = blank.defaultView!.getComputedStyle(sample);
      for (const name of Array.from(bare)) base.set(name, bare.getPropertyValue(name));
    }
    const cs = getComputedStyle(el);
    const lines: string[] = [];
    for (const name of Array.from(cs)) {
      if (noise(name)) continue;
      const value = cs.getPropertyValue(name);
      if (value && value !== base.get(name)) lines.push(`  ${name}: ${value};`);
    }
    const tag = el.tagName.toLowerCase();
    const classes = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : '';
    return `${tag}${el.id ? `#${el.id}` : ''}${classes} {\n${lines.join('\n')}\n}`;
  } finally {
    frame.remove();
  }
}
