// cspell:words opentag closetag
/**
 * A read-only element tree parsed from an SVG string (saxes), with the read half of core's
 * `SvgTree` API, so tests can query what `render()` returned without reaching inside it.
 */
import { SaxesParser } from 'saxes';

export interface SvgElement {
  readonly tag?: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: SvgElement[];
  readonly text?: string;
  readonly parent?: SvgElement;
}

export type SvgQuery =
  | { readonly tag?: string; readonly class?: string; readonly 'data-id'?: string }
  | ((node: SvgElement, tree: SvgView) => boolean);

export interface SvgView {
  readonly root: SvgElement;
  find(match: SvgQuery): SvgElement[];
  tag(node: SvgElement): string | undefined;
  textOf(node: SvgElement): string | undefined;
  getAttr(node: SvgElement, name: string): string | undefined;
  children(node: SvgElement): SvgElement[];
}

export function parseSvg(svg: string): SvgView {
  const root: SvgElement = { attrs: {}, children: [] };
  const stack: SvgElement[] = [root];
  const parser = new SaxesParser();
  parser.on('error', (e) => {
    throw e;
  });
  parser.on('opentag', (t) => {
    const parent = stack[stack.length - 1]!;
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(t.attributes)) attrs[k] = String(v);
    const el: SvgElement = { tag: t.name, attrs, children: [], parent };
    parent.children.push(el);
    stack.push(el);
  });
  parser.on('closetag', () => void stack.pop());
  parser.on('text', (text) => {
    const parent = stack[stack.length - 1]!;
    parent.children.push({ attrs: {}, children: [], text, parent });
  });
  parser.write(svg).close();
  const view: SvgView = {
    root,
    find(match) {
      const out: SvgElement[] = [];
      const test =
        typeof match === 'function'
          ? (n: SvgElement) => match(n, view)
          : (n: SvgElement) =>
              (match.tag === undefined || n.tag === match.tag) &&
              (match.class === undefined ||
                (n.attrs.class ?? '').split(' ').includes(match.class)) &&
              (match['data-id'] === undefined || n.attrs['data-id'] === match['data-id']);
      const walk = (n: SvgElement): void => {
        for (const c of n.children) {
          if (c.tag === undefined) continue;
          if (test(c)) out.push(c);
          walk(c);
        }
      };
      walk(root);
      return out;
    },
    tag: (n) => n.tag,
    textOf: (n) => (n.tag === undefined ? n.text : undefined),
    getAttr: (n, name) => n.attrs[name],
    children: (n) => n.children,
  };
  return view;
}

/**
 * `svg` without the embedded diagrams' roots (ADR-15): every nested `<svg>…</svg>`, whose
 * markup is the inner diagram's, not the host's.
 */
export function withoutEmbedded(svg: string): string {
  const first = svg.indexOf('<svg', 1);
  if (first < 0) return svg;
  let out = svg.slice(0, first);
  let depth = 0;
  let i = first;
  const tag = /<(\/?)svg\b[^>]*?(\/?)>/g;
  for (;;) {
    tag.lastIndex = i;
    const m = tag.exec(svg);
    if (!m) return out + svg.slice(i);
    if (depth === 0) out += svg.slice(i, m.index);
    if (m[1]) depth--;
    else if (!m[2]) depth++;
    i = m.index + m[0].length;
    // The outer root's own `</svg>` closes the document.
    if (depth < 0) return out + svg.slice(m.index);
  }
}

/** Whether `node` is inside an embedded diagram's root (a nested `<svg>`, ADR-15). */
export function inEmbedded(node: SvgElement): boolean {
  let svgs = 0;
  for (let p = node.parent; p; p = p.parent) if (p.tag === 'svg') svgs++;
  return svgs > 1;
}
