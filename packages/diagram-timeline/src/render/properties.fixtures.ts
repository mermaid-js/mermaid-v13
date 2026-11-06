/**
 * Test-only (not built, not exported): the render properties of spec #291 T4 (DESIGN §13.2,
 * §13.4) as a function of one rendered SVG and the model it was drawn from, so the render spec
 * runs them over the hand-built fixtures today and T2 runs the same function over the parsed
 * corpus. Each property gives readable violations; none means the render holds them all.
 *
 * - well-formed XML, and `assertInert` with the render's gradient and `theme: 'auto'` sheet;
 * - no `NaN`, `Infinity` or `undefined`, no `foreignObject`, no `<marker>` (D253);
 * - no element id but `<prefix>-title` and `<prefix>-desc`;
 * - every drawn coordinate inside the viewBox;
 * - exactly one `data-ast` element per section, period and event, and no other (R-PARSE-8);
 * - every alias the SVG refers to (`var(--_x)`) declared by the root.
 */
import { assertInert } from '@mermaid-js/core/svg';
import type { TimelineModel } from '../model.ts';

export interface RenderedSvg {
  readonly svg: string;
  readonly gradient: string | false;
  readonly themeStyle: boolean;
}

export interface Element {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
}

/** The writer rounds to two decimals. */
const TOL = 0.01;

// One token of the writer's XML: a tag (its attributes checked apart), or character data.
const RE_TOKEN = /<(\/?)([A-Za-z][\w:-]*)([^<>]*)>|([^<]+)/y;
const RE_ATTR = /([A-Za-z_:][\w:.-]*)="([^"<]*)"/g;
const RE_BAD_REF = /&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[\da-f]{1,6});)/i;

/**
 * Every element of `svg` in document order, and its first XML error. A small XML
 * scanner for what `SvgWriter` writes (diagram packages may import only core, so no XML
 * library): balanced tags, double-quoted attributes once each, valid references, one root.
 */
export function elementsOf(svg: string): { elements: Element[]; problem?: string } {
  const elements: Element[] = [];
  const stack: string[] = [];
  let roots = 0;
  RE_TOKEN.lastIndex = 0;
  while (RE_TOKEN.lastIndex < svg.length) {
    const at = RE_TOKEN.lastIndex;
    const m = RE_TOKEN.exec(svg);
    if (!m) return { elements, problem: `unexpected markup at ${at}` };
    const [, close, tag, rest, text] = m;
    if (text !== undefined) {
      if (stack.length === 0 && text.trim() !== '')
        return { elements, problem: 'text outside the root' };
      if (RE_BAD_REF.test(text)) return { elements, problem: `a bad reference at ${at}` };
      continue;
    }
    const selfClose = rest!.endsWith('/');
    const rawAttrs = selfClose ? rest!.slice(0, -1) : rest!;
    if (rawAttrs.replace(RE_ATTR, '').trim() !== '')
      return { elements, problem: `malformed attributes on <${tag}> at ${at}` };
    if (close) {
      if (rawAttrs.trim() !== '') return { elements, problem: `attributes on </${tag}>` };
      if (stack.pop() !== tag) return { elements, problem: `</${tag}> closes nothing at ${at}` };
      continue;
    }
    if (stack.length === 0 && ++roots > 1) return { elements, problem: 'a second root' };
    const attrs: Record<string, string> = {};
    for (const [, name, value] of rawAttrs.matchAll(RE_ATTR)) {
      if (name! in attrs) return { elements, problem: `${name} twice on <${tag}>` };
      if (RE_BAD_REF.test(value!)) return { elements, problem: `a bad reference in ${name}` };
      attrs[name!] = value!
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    }
    elements.push({ tag: tag!, attrs });
    if (!selfClose) stack.push(tag!);
  }
  if (stack.length > 0) return { elements, problem: `<${stack.at(-1)}> is not closed` };
  return { elements };
}

const numbers = (s: string): number[] =>
  (s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);

/** The points an element draws at (absolute coordinates: the renderer writes no transform). */
function pointsOf(el: Element): [number, number][] {
  const a = (name: string): number => Number(el.attrs[name] ?? 0);
  switch (el.tag) {
    case 'line':
      return [
        [a('x1'), a('y1')],
        [a('x2'), a('y2')],
      ];
    case 'path': {
      const p = numbers(el.attrs.d ?? '');
      const out: [number, number][] = [];
      for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i]!, p[i + 1]!]);
      return out;
    }
    case 'rect':
      return [
        [a('x'), a('y')],
        [a('x') + a('width'), a('y') + a('height')],
      ];
    case 'text':
    case 'tspan':
      return el.attrs.x === undefined ? [] : [[a('x'), a('y')]];
    default:
      return [];
  }
}

/** `assertInert` with the render's gradient and sheet, and the strings no SVG may hold. */
function inertness(r: RenderedSvg): string[] {
  const out: string[] = [];
  try {
    assertInert(r.svg, { gradient: r.gradient, themeStyle: r.themeStyle });
  } catch (e) {
    out.push(`not inert: ${(e as Error).message}`);
  }
  for (const bad of ['NaN', 'Infinity', 'undefined', 'foreignObject', '<marker'])
    if (r.svg.includes(bad)) out.push(`writes ${bad}`);
  return out;
}

/** Element ids other than the title's and the description's (the gradient's is its own). */
function ids(elements: readonly Element[]): string[] {
  return elements
    .filter((el) => el.attrs.id !== undefined && el.tag !== 'linearGradient')
    .filter((el) => !/-(?:title|desc)$/.test(el.attrs.id!) || !['title', 'desc'].includes(el.tag))
    .map((el) => `writes the id ${el.attrs.id}`);
}

/** The first drawn point outside the root's viewBox. */
function outside(root: Element, elements: readonly Element[]): string[] {
  const [vx, vy, vw, vh] = numbers(root.attrs.viewBox ?? '');
  if ([vx, vy, vw, vh].some((n) => n === undefined || !Number.isFinite(n)))
    return [`viewBox ${root.attrs.viewBox}`];
  for (const el of elements)
    for (const [x, y] of pointsOf(el))
      if (x < vx! - TOL || y < vy! - TOL || x > vx! + vw! + TOL || y > vy! + vh! + TOL)
        return [`<${el.tag}> draws at (${x}, ${y}), outside the viewBox ${root.attrs.viewBox}`];
  return [];
}

/** Exactly one `data-ast` element per section, period and event, carrying its `data-id`. */
function astElements(elements: readonly Element[], model: TimelineModel): string[] {
  const out: string[] = [];
  const expected = new Set([
    ...model.sections.map((s) => s.ast),
    ...model.periods.flatMap((p) => [p.ast, ...p.events.map((e) => e.ast)]),
  ]);
  const seen = new Map<string, number>();
  for (const el of elements) {
    const ast = el.attrs['data-ast'];
    if (ast === undefined) continue;
    seen.set(ast, (seen.get(ast) ?? 0) + 1);
    if (el.attrs['data-id'] !== ast) out.push(`data-ast ${ast} has data-id ${el.attrs['data-id']}`);
  }
  for (const id of expected)
    if (seen.get(id) !== 1) out.push(`${id} has ${seen.get(id) ?? 0} data-ast elements`);
  for (const id of seen.keys())
    if (!expected.has(id)) out.push(`data-ast ${id} is not in the model`);
  return out;
}

/** The first alias the SVG refers to that no declaration sets. */
function undeclared(svg: string): string[] {
  const declared = new Set([...svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]!));
  for (const m of svg.matchAll(/var\((--_[\w-]+)\)/g))
    if (!declared.has(m[1]!)) return [`refers to ${m[1]}, which the root does not declare`];
  return [];
}

/** Every render property `r` breaks, for the model it drew. */
export function renderViolations(r: RenderedSvg, model: TimelineModel): string[] {
  const { elements, problem } = elementsOf(r.svg);
  if (problem) return [`not well-formed: ${problem}`];
  const root = elements[0];
  if (root?.tag !== 'svg') return ['the root is not <svg>'];
  return [
    ...inertness(r),
    ...ids(elements),
    ...outside(root, elements),
    ...astElements(elements, model),
    ...undeclared(r.svg),
  ];
}
