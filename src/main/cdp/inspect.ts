// Measures one element for design work: where it sits, how big it is and the computed styles that decide its look.
import { HatchError, type PageSession } from './session';

const MEASURE = `function () {
  const el = this.nodeType === 1 ? this : this.parentElement;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const round = (n) => Math.round(n * 10) / 10;
  const rgba = (c) => { const m = c.match(/[\\d.]+/g); return m ? { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] } : null; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // The colour behind the text: every background from the element up, laid over white.
  const layers = [];
  let image = false;
  for (let n = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.backgroundImage !== 'none') image = true;
    const c = rgba(s.backgroundColor);
    if (c && c.a > 0) layers.push(c);
    if (c && c.a === 1) break;
  }
  const behind = layers.reverse().reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ink = rgba(cs.color);
  const text = ink ? over(ink, behind) : null;
  const contrast = text ? (Math.max(lum(text), lum(behind)) + 0.05) / (Math.min(lum(text), lum(behind)) + 0.05) : null;
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const pick = (names) => Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]).filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'rgba(0, 0, 0, 0)'));
  const flexOrGrid = /flex|grid/.test(cs.display);
  return {
    tag: el.tagName.toLowerCase(), id: el.id, classes: [...el.classList].slice(0, 12),
    box: { x: round(r.left), y: round(r.top), width: round(r.width), height: round(r.height), pageX: round(r.left + scrollX), pageY: round(r.top + scrollY) },
    viewport: { width: innerWidth, height: innerHeight },
    visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0,
    hasText: [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
    contrast: contrast ? Math.round(contrast * 100) / 100 : null, behind: hex(behind), overImage: image,
    layout: pick(['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'overflow', 'box-sizing', ...(flexOrGrid ? ['flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap', 'grid-template-columns', 'grid-template-rows'] : []), 'flex', 'align-self', 'grid-column', 'grid-row']),
    spacing: pick(['margin', 'padding']),
    type: pick(['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line', 'color']),
    surface: pick(['background-color', 'background-image', 'border', 'border-radius', 'box-shadow', 'opacity', 'outline', 'transform', 'filter', 'cursor']),
  };
}`;

interface Measured {
  tag: string; id: string; classes: string[];
  box: { x: number; y: number; width: number; height: number; pageX: number; pageY: number };
  viewport: { width: number; height: number };
  visible: boolean; hasText: boolean; contrast: number | null; behind: string; overImage: boolean;
  layout: Record<string, string>; spacing: Record<string, string>; type: Record<string, string>; surface: Record<string, string>;
}

export async function getElement(page: PageSession, ref: string): Promise<string> {
  const backendNodeId = page.refs.nodeFor(ref);
  if (backendNodeId === undefined) throw new HatchError(`No element has the reference ${ref} on this page. References clear when the page navigates. Call snapshot and use a reference from the new outline.`);
  let m: Measured;
  try {
    const { object } = await page.send<{ object: { objectId: string } }>('DOM.resolveNode', { backendNodeId });
    const r = await page.send<{ result: { value: Measured } }>('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: MEASURE, returnByValue: true });
    m = r.result.value;
  } catch (e) {
    if (e instanceof HatchError) throw e;
    throw new HatchError(`The element ${ref} has left the page. Call snapshot and use a reference from the new outline.`);
  }
  const block = (title: string, values: Record<string, string>): string[] => (Object.keys(values).length ? [title, ...Object.entries(values).map(([k, v]) => `  ${k}: ${v}`)] : []);
  const name = `<${m.tag}${m.id ? `#${m.id}` : ''}${m.classes.map((c) => `.${c}`).join('')}>`;
  const place = `${m.box.width} × ${m.box.height} px at x ${m.box.x}, y ${m.box.y} in a ${m.viewport.width} × ${m.viewport.height} viewport (page position ${m.box.pageX}, ${m.box.pageY})`;
  const lines = [`${ref} ${name}`, place + (m.visible ? '' : '. The element is hidden or has no size.')];
  if (m.hasText && m.contrast !== null) {
    const verdict = m.contrast >= 4.5 ? 'passes WCAG AA for body text' : m.contrast >= 3 ? 'passes WCAG AA for large text only (4.5 needed for body text)' : 'fails WCAG AA (3 needed for large text, 4.5 for body text)';
    lines.push(`text contrast ${m.contrast}:1 against ${m.behind}, which ${verdict}${m.overImage ? '. A background image sits behind the text, so check a screenshot too' : ''}`);
  }
  return [...lines, ...block('layout', m.layout), ...block('spacing', m.spacing), ...block('type', m.type), ...block('surface', m.surface)].join('\n');
}
