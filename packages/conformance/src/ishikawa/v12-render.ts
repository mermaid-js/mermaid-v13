/**
 * v12's drawn ishikawa geometry (spec #519): mermaid\@12.2.0's own `ishikawaRenderer.ts` run
 * under jsdom, with `getBBox` answering v12's sizes as a fixed measure: every character
 * {@link CHAR_EM} em wide (v12's own wrap count assumed as much) at the size v12 drew it, 14 px for
 * the head label and the config's 16 px for the rest, and every line {@link LINE} px high.
 *
 * The fake box of a `<text>` is what a browser would give for v12's attributes: as wide as its
 * widest `tspan`, as high as its lines, placed by its `text-anchor`, and centred on the point
 * v12's lines are centred on (its first line sits `(n − 1) × 1.05 × fontSize / 2` above it). Every
 * other element's box is empty, so v12's `viewBox` is not compared.
 *
 * The DOM is vitest's own jsdom environment, set up on the global object for these renders only
 * (the spec itself runs in Node, so Vite transforms it as Node code) and torn down by
 * {@link closeV12}.
 */
import { builtinEnvironments } from 'vitest/runtime';

/** A character's width in em, at the size it is drawn at, and a line's height in px. */
export const CHAR_EM = 0.6;
export const LINE = 20;
/** v12's config `fontSize`, and the size its style sheet drew the head label at. */
const V12_FONT_SIZE = 16;
const V12_HEAD_SIZE = 14;
/** v12's `tspan` step at its config `fontSize`: `1.05 × 16`. */
const V12_LINE_STEP = 16.8;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function fakeBBox(this: Element): Box {
  if (this.tagName.toLowerCase() !== 'text') return { x: 0, y: 0, width: 0, height: 0 };
  const lines = [...this.querySelectorAll('tspan')].map((t) => t.textContent);
  const size = this.classList.contains('ishikawa-head-label') ? V12_HEAD_SIZE : V12_FONT_SIZE;
  let width = 0;
  for (const l of lines) width = Math.max(width, [...l].length * CHAR_EM * size);
  const height = lines.length * LINE;
  const x0 = Number(this.getAttribute('x'));
  const anchor = this.getAttribute('text-anchor');
  const shift: Readonly<Record<string, number>> = { middle: width / 2, end: width };
  const x = x0 - (shift[anchor ?? ''] ?? 0);
  const centre = Number(this.getAttribute('y')) + ((lines.length - 1) * V12_LINE_STEP) / 2;
  return { x, y: centre - height / 2, width, height };
}

interface MermaidV12 {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
}

let loading: Promise<MermaidV12> | undefined;
let teardown: (() => unknown) | undefined;

function load(): Promise<MermaidV12> {
  loading ??= (async () => {
    const env = await builtinEnvironments.jsdom.setup(globalThis, {});
    teardown = () => env.teardown(globalThis);
    const svgProto = (globalThis as unknown as { SVGElement: { prototype: object } }).SVGElement
      .prototype;
    Object.assign(svgProto, { getBBox: fakeBBox });
    const mermaid = ((await import('mermaid-v12')) as unknown as { default: MermaidV12 }).default;
    mermaid.initialize({ startOnLoad: false });
    return mermaid;
  })();
  return loading;
}

/** A line v12 drew: `ishikawa-spine`, `-branch` or `-sub-branch`. */
export interface V12Line {
  readonly kind: 'spine' | 'branch' | 'sub-branch';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** What v12 drew, in document order within each kind. */
export interface V12Drawn {
  readonly spine?: V12Line;
  /** The head path's `h` and its control point's x (`2.4 w`). */
  readonly head?: { readonly height: number; readonly control: number };
  /** Branches, their label boxes and sub-branches, in document order. */
  readonly parts: readonly (V12Line | ({ readonly kind: 'box' } & Box))[];
  /** The sub-cause `text` points (`x`, and `y` moved to the centre of its lines) in order. */
  readonly subText: readonly { readonly x: number; readonly y: number }[];
}

let n = 0;

/** v12's drawing of `src`, or undefined when v12 rejects it. */
export async function v12Drawn(src: string): Promise<V12Drawn | undefined> {
  const mermaid = await load();
  let svg: string;
  try {
    ({ svg } = await mermaid.render(`ishikawa-v12-${n++}`, src));
  } catch {
    return undefined;
  }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const num = (e: Element, a: string): number => Number(e.getAttribute(a));
  const line = (e: Element): V12Line => ({
    kind: e.getAttribute('class')!.replace('ishikawa-', '') as V12Line['kind'],
    x1: num(e, 'x1'),
    y1: num(e, 'y1'),
    x2: num(e, 'x2'),
    y2: num(e, 'y2'),
  });
  const spineEl = doc.querySelector('line.ishikawa-spine');
  const headEl = doc.querySelector('path.ishikawa-head');
  const d = headEl?.getAttribute('d')?.split(/\s+/).map(Number);
  const parts = [
    ...doc.querySelectorAll(
      'line.ishikawa-branch, line.ishikawa-sub-branch, rect.ishikawa-label-box'
    ),
  ].map((e) =>
    e.tagName.toLowerCase() === 'rect'
      ? {
          kind: 'box' as const,
          x: num(e, 'x'),
          y: num(e, 'y'),
          width: num(e, 'width'),
          height: num(e, 'height'),
        }
      : line(e)
  );
  const subText = [...doc.querySelectorAll('g.ishikawa-sub-group > text')].map((t) => ({
    x: num(t, 'x'),
    y: num(t, 'y') + ((t.querySelectorAll('tspan').length - 1) * V12_LINE_STEP) / 2,
  }));
  return {
    ...(spineEl ? { spine: line(spineEl) } : {}),
    // `M 0 −h/2 L 0 h/2 Q 2.4w 0 0 −h/2 Z`.
    ...(d ? { head: { height: (d[5] ?? 0) * 2, control: d[7] ?? 0 } } : {}),
    parts,
    subText,
  };
}

/** Tears down the DOM the renders set up. */
export async function closeV12(): Promise<void> {
  await teardown?.();
  teardown = undefined;
  loading = undefined;
}
