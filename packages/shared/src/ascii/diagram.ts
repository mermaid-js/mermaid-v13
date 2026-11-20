/**
 * What the diagrams' text renderers share (DESIGN §6.3): the cells of a box and of a route,
 * the line and its tees, labels, the title, and the `ASCII_DROPPED` warning. Every `diagram-*`
 * ASCII path used to carry a copy; where the copies differed, the difference is a parameter.
 */
import type { Point } from '@mermaid-js/core/layout';
import { type MeasuredLabel, Style } from '@mermaid-js/core/text';
import {
  armOf,
  ascii as asciiSet,
  asciiOptions,
  Canvas,
  type CellRect,
  cellWidth,
  type Dir,
  DOWN,
  drawText,
  DX,
  DY,
  glyphFor,
  type GlyphSet,
  graphemes,
  junction,
  LEFT,
  opposite,
  RIGHT,
  sideOf,
  type Sides,
  type Stroke,
  unicode,
  UP,
} from '@mermaid-js/core/ascii';

/** A box by its centre and size. */
export interface Centred {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The cells of a box from its centre and size (the grid model's convention, `LayoutGraph.grid`). */
export function cellRect(b: Centred): CellRect {
  const x = Math.round(b.x - b.width / 2 + 0.5);
  const y = Math.round(b.y - b.height / 2 + 0.5);
  return {
    x,
    y,
    width: Math.round(b.x + b.width / 2 - 0.5) - x + 1,
    height: Math.round(b.y + b.height / 2 - 0.5) - y + 1,
  };
}

/** The direction from `a` to `b`, two cells on one row or column. */
export function dirOf(a: Point, b: Point): Dir {
  if (b.x !== a.x) return b.x > a.x ? RIGHT : LEFT;
  return b.y > a.y ? DOWN : UP;
}

/** The cells a corner polyline passes, in order. */
export function cellsOf(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  points.forEach((p, i) => {
    if (i === 0) return void out.push(p);
    const prev = points[i - 1]!;
    const d = dirOf(prev, p);
    const n = Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y);
    for (let k = 1; k <= n; k++) out.push({ x: prev.x + DX[d] * k, y: prev.y + DY[d] * k });
  });
  return out;
}

/**
 * Draws a line over `cells`, its ends reaching `intoSource` and `intoTarget`. `line.dotted`
 * draws its straight runs with those glyphs; `line.weight` 2 is a thick line.
 */
export function drawLineCells(
  canvas: Canvas,
  glyphs: GlyphSet,
  cells: readonly Point[],
  intoSource: Dir,
  intoTarget: Dir,
  line: { readonly dotted?: Stroke | undefined; readonly weight?: 1 | 2 } = {}
): void {
  const { dotted, weight = 1 } = line;
  const last = cells.length - 1;
  cells.forEach((c, i) => {
    let arms = 0;
    const arm = (d: Dir): void => void (arms |= armOf(d, weight));
    if (i > 0) arm(dirOf(c, cells[i - 1]!));
    if (i < last) arm(dirOf(c, cells[i + 1]!));
    if (i === 0) arm(intoSource);
    if (i === last) arm(intoTarget);
    let glyph = glyphFor(arms, glyphs);
    if (dotted && arms === (armOf(LEFT, weight) | armOf(RIGHT, weight))) glyph = dotted.h;
    if (dotted && arms === (armOf(UP, weight) | armOf(DOWN, weight))) glyph = dotted.v;
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
}

/**
 * A tee where a line leaves a box: on the border cell `end.into` of `end.cell`. With `merge`
 * (the Unicode set) a one-armed stub towards the edge is merged into the border; else, or when
 * nothing merges, the plain tee of `tees`.
 */
export function tee(
  canvas: Canvas,
  tees: Sides,
  merge: boolean,
  end: { readonly cell: Point; readonly into: Dir },
  weight: 1 | 2 = 1
): void {
  const x = end.cell.x + DX[end.into];
  const y = end.cell.y + DY[end.into];
  const out = opposite(end.into);
  const fallback = sideOf(tees, out);
  if (!merge) return void canvas.set(x, y, fallback);
  const stub = glyphFor(armOf(out, weight), unicode)!;
  const merged = junction(canvas.get(x, y), stub);
  canvas.set(x, y, merged === stub ? fallback : merged);
}

/**
 * Writes a label in a box `width` wide at `x`: each line centred, a list left-aligned as one
 * block. `bullet` replaces a list item's own marker (ASCII has no `•`).
 */
export function writeLabel(
  canvas: Canvas,
  label: MeasuredLabel,
  x: number,
  y: number,
  width: number,
  bullet?: string
): void {
  label.lines.forEach((runs, i) => {
    let text = runs.map((r) => r.text).join('');
    // Only a list item's own marker: a bullet written in the text stays as written.
    if (bullet !== undefined && label.left) text = text.replace(/^(\s*)[•◦]/, `$1${bullet}`);
    const left = x + Math.floor((width - label.width) / 2) + (label.indents[i] ?? 0);
    const centred = x + Math.floor((width - (label.widths[i] ?? 0)) / 2);
    drawText(canvas, label.left ? left : centred, y + i, text);
  });
}

/** `text` in at most `width` cells, cut with `mark` when it is longer. */
export function cut(text: string, width: number, mark: string, emptyAtZero = false): string {
  if (cellWidth(text) <= width) return text;
  if (emptyAtZero && width <= 0) return '';
  let out = '';
  let used = 0;
  for (const g of graphemes(text)) {
    if (used + g.width > width - 1) break;
    out += g.text;
    used += g.width;
  }
  return out + mark;
}

/** `text` wrapped at blanks to lines of at most `width` cells (a longer word stays whole). */
export function wrapTitle(text: string, width: number): string[] {
  if (cellWidth(text) <= width) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && cellWidth(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * A drawing (a canvas, or its text) without its empty margin: the blank rows at the ends and
 * the common left margin dropped. `top` and `left` are how many rows and columns that took.
 */
export function trimmed(drawn: Canvas | string): { text: string; top: number; left: number } {
  let lines = String(drawn).split('\n');
  let top = 0;
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
    top++;
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const margin = Math.min(...lines.filter((l) => l !== '').map((l) => l.search(/\S/)));
  const left = margin > 0 && Number.isFinite(margin) ? margin : 0;
  if (left > 0) lines = lines.map((l) => l.slice(left));
  return { text: lines.join('\n'), top, left };
}

/**
 * The drawing as text: blank rows at the ends and the common left margin dropped, the title
 * centred over it on the first lines.
 */
export function finish(canvas: Canvas, title: string | undefined, maxWidth?: number): string {
  const body = trimmed(canvas).text;
  const lines = body === '' ? [] : body.split('\n');
  const text = title?.trim();
  if (text) {
    const width = Math.max(0, ...lines.map(cellWidth));
    // Only a width budget wraps it: then to the budget, or to the drawing when that is wider.
    const wrapped = maxWidth === undefined ? [text] : wrapTitle(text, Math.max(width, maxWidth));
    const out = new Canvas();
    wrapped.forEach((line, i) =>
      drawText(out, Math.max(0, Math.floor((width - cellWidth(line)) / 2)), i, line)
    );
    lines.unshift(...out.toString().split('\n'));
  }
  return lines.join('\n');
}

/** Whether a label has bold or italic runs, which text output cannot show. */
export const emphasised = (label: MeasuredLabel | undefined): boolean =>
  label?.lines.some((line) =>
    line.some((run) => (run.style & (Style.Bold | Style.Italic)) !== 0)
  ) ?? false;

/** Whether a checked style sets anything. */
export const styled = (s: { readonly shape: object; readonly text: object }): boolean =>
  Object.keys(s.shape).length > 0 || Object.keys(s.text).length > 0;

/** The ids of every node of an AST, by node type, in document order. */
export function statements(
  ast:
    | { readonly type: string; readonly id: string; readonly children?: readonly unknown[] }
    | undefined,
  out: Map<string, string[]>
): void {
  if (!ast) return;
  const list = out.get(ast.type);
  if (list) list.push(ast.id);
  else out.set(ast.type, [ast.id]);
  for (const child of ast.children ?? [])
    statements(child as Parameters<typeof statements>[0], out);
}

/** One `ASCII_DROPPED` warning (D82): text output has no `what`. `keys` names what, in brackets. */
export function asciiDropped<F extends string>(
  feature: F,
  astIds: readonly string[],
  what: string,
  keys = ''
): { code: 'ASCII_DROPPED'; feature: F; astIds: readonly string[]; message: string } {
  return {
    code: 'ASCII_DROPPED',
    feature,
    astIds,
    message: `Text output has no ${what}${keys}; dropped.`,
  };
}

/** The glyph set of the configured `ascii.charset`. */
export const glyphSetOf = (config: Parameters<typeof asciiOptions>[0]): GlyphSet =>
  asciiOptions(config).charset === 'ascii' ? asciiSet : unicode;

/**
 * The `ASCII_ROUTE` warning (D78) for the stretches the repair router found no free lane for,
 * or undefined when there are none. `noun` names the edges; `astIds` gives an edge's AST ids
 * (the edge id itself by default).
 */
export function asciiRoute(
  unresolved: readonly { readonly edge: string }[],
  noun: string,
  astIds: (edge: string) => string | readonly string[] = (edge) => edge
): { code: 'ASCII_ROUTE'; astIds: string[]; message: string } | undefined {
  if (unresolved.length === 0) return undefined;
  const edges = [...new Set(unresolved.map((c) => c.edge))];
  return {
    code: 'ASCII_ROUTE',
    astIds: edges.flatMap(astIds),
    message: `No free lane for ${noun} ${edges.join(', ')}; their lines touch other lines or text.`,
  };
}
