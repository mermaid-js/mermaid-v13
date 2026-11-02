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
