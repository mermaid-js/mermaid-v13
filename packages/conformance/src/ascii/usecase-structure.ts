// Reads a usecase text drawing back against the cell layout it was drawn from (#569, D478), for
// the corpus and fuzz suites: where each node, frame, label and line end must be, and what each
// must look like there. Independent of the drawing code: positions come from the layout and the
// repaired routes, glyphs from D478 and core's glyph tables.
import { graphemes, repairRoutes } from '@mermaid-js/core/ascii';
import type { Point } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { MarkerType, UsecaseEdgeView, UsecaseNodeView } from '@mermaid-js/diagram-usecase';
import type { Charset } from './structure.ts';
import type { UsecaseCellLayout } from './usecase-render.ts';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Cells a centred box covers, the grid model's convention (`LayoutGraph.grid`). */
export const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  x0: Math.round(b.x - b.width / 2 + 0.5),
  y0: Math.round(b.y - b.height / 2 + 0.5),
  x1: Math.round(b.x + b.width / 2 - 0.5),
  y1: Math.round(b.y + b.height / 2 - 0.5),
});

/** A line as cells: a wide grapheme takes its cell and an empty one after it. */
function cellsOfLine(line: string): string[] {
  const out: string[] = [];
  for (const g of graphemes(line)) {
    if (g.width === 0) {
      if (out.length > 0) out[out.length - 1] += g.text;
      continue;
    }
    out.push(g.text, ...(g.width === 2 ? [''] : []));
  }
  return out;
}

const lineText = (l: MeasuredLabel, i: number): string =>
  (l.lines[i] ?? []).map((r) => r.text).join('');

/** The cells a corner polyline passes, in order. */
function walk(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  points.forEach((p, i) => {
    if (i === 0) return void out.push(p);
    const q = points[i - 1]!;
    const n = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
    const dx = Math.sign(p.x - q.x);
    const dy = Math.sign(p.y - q.y);
    for (let k = 1; k <= n; k++) out.push({ x: q.x + dx * k, y: q.y + dy * k });
  });
  return out;
}

const GLYPHS = {
  unicode: {
    corner: '┌┐└┘╭╮╰╯',
    side: '│┼├┤╪╫',
    rule: '─┼┬┴╪╫',
    crossing: '┼',
    line: '─│┄┆┌┐└┘├┤┬┴┼',
    dotted: '┄┆',
    solid: '─│',
    head: { up: '▲', down: '▼', left: '◄', right: '►' },
    triangle: { up: '△', down: '▽', left: '◁', right: '▷' },
    circle: '●',
    cross: '✕',
  },
  ascii: {
    corner: '+',
    side: '|+',
    rule: '-+',
    crossing: '+',
    line: '-|.:+',
    dotted: '.:',
    solid: '-|',
    head: { up: '^', down: 'v', left: '<', right: '>' },
    triangle: { up: '^', down: 'v', left: '<', right: '>' },
    circle: 'o',
    cross: 'x',
  },
} as const;

type Way = 'up' | 'down' | 'left' | 'right';
const STEP: Record<Way, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
/** The direction from an end cell into its node, by the side the end is on. */
const INTO: Record<string, Way> = { top: 'down', bottom: 'up', left: 'right', right: 'left' };

type Marker = MarkerType;

export interface ReadBack {
  /** Every fault found, as text. */
  faults: string[];
  /** Line ends checked. */
  ends: number;
}

type Glyphs = (typeof GLYPHS)[Charset];

/** What every check reads: the layout, the text as cells in layout coordinates, the faults. */
interface Ctx {
  readonly cs: Charset;
  readonly g: Glyphs;
  readonly layout: UsecaseCellLayout;
  readonly routes: ReadonlyMap<string, readonly Point[]>;
  readonly rects: ReadonlyMap<string, Rect>;
  readonly frames: ReadonlyMap<string, Rect>;
  /** The glyph at a layout cell. */
  readonly at: (x: number, y: number) => string;
  /** A row's text from x0 to x1, control characters left out (they take no cell). */
  readonly row: (y: number, x0: number, x1: number) => string;
  readonly fault: (s: string) => void;
}

/** Where a node's measured block starts in its laid-out box (as D140 keeps it centred). */
const offset = (r: Rect, v: UsecaseNodeView): Point => ({
  x: r.x0 + Math.floor((r.x1 - r.x0 + 1 - v.width) / 2),
  y: r.y0 + Math.floor((r.y1 - r.y0 + 1 - v.height) / 2),
});

/** The column of an actor's figure: centred, rounded as the engine rounds a lone end. */
const figureX = (r: Rect): number => r.x0 + Math.round((r.x1 - r.x0 + 1 - 3) / 2);

/** An edge's label box, if it has one placed. */
function labelRect(layout: UsecaseCellLayout, e: UsecaseEdgeView): Rect | undefined {
  const placed = layout.edges.get(e.id)?.label;
  if (e.kind !== 'relation' || !e.label || !placed || e.label.width === 0) return undefined;
  return rectOf({ ...placed, width: e.label.width, height: Math.max(e.label.height, 1) });
}

/**
 * The drawing's origin: its leftmost and topmost drawn cell (frames, boxes, lines, labels, an
 * actor's figure and labels), as the drawing trims its empty margin.
 */
function origin(
  layout: UsecaseCellLayout,
  routes: ReadonlyMap<string, readonly Point[]>,
  rects: ReadonlyMap<string, Rect>
): Point {
  let x = Infinity;
  let y = Infinity;
  const see = (px: number, py: number) => {
    x = Math.min(x, px);
    y = Math.min(y, py);
  };
  for (const b of layout.groups.values()) {
    const r = rectOf(b);
    see(r.x0, r.y0);
  }
  for (const v of layout.usecase.nodes.values()) {
    const r = rects.get(v.id);
    if (!r) continue;
    if (v.kind !== 'actor') {
      see(r.x0, r.y0);
      continue;
    }
    const top = offset(r, v).y;
    const width = r.x1 - r.x0 + 1;
    see(figureX(r), top + v.glyphTop);
    for (const [label, at] of [
      [v.stereotype, v.stereotypeTop],
      [v.label, v.labelTop],
    ] as const)
      label?.widths.forEach((w, i) => {
        if (w > 0) see(r.x0 + Math.floor((width - w) / 2), top + at + i);
      });
  }
  for (const route of routes.values()) for (const p of walk(route)) see(p.x, p.y);
  for (const e of layout.usecase.edges) {
    const r = labelRect(layout, e);
    if (r) see(r.x0, r.y0);
  }
  return { x, y };
}

/** Every line of `label` is on some row of `r`. */
function hasLabel(c: Ctx, r: Rect, label: MeasuredLabel | undefined, name: string): void {
  label?.lines.forEach((_, i) => {
    let want = lineText(label, i)
      .replace(/\p{Cc}/gu, '')
      .trim();
    if (want === '') return;
    // A Markdown list's bullets are `-` in the ascii charset (as the flowchart's).
    if (c.cs === 'ascii' && label.left) want = want.replace(/^[•◦]/, '-');
    let found = false;
    for (let y = r.y0; y <= r.y1 && !found; y++) found = c.row(y, r.x0, r.x1).includes(want);
    if (!found) c.fault(`${name}: ${JSON.stringify(want)} not in its box`);
  });
}

/**
 * Frames: whole, the title on the top border, nothing else on them (pitfall 20). A line crosses
 * a frame as a crossing glyph: a marker, a `|>` bar or a label there would read as the frame
 * (or cut it).
 */
function checkFrames(c: Ctx): void {
  const { g, at, fault } = c;
  const crossed = new Set<string>();
  for (const route of c.routes.values()) for (const p of walk(route)) crossed.add(`${p.x},${p.y}`);
  for (const b of c.layout.usecase.boundaries) {
    const r = c.frames.get(b.id);
    const placed = c.layout.groups.get(b.id);
    if (!r || !placed) continue;
    const t =
      b.label.width > 0 ? rectOf({ ...placed.title, width: b.label.width, height: 1 }) : undefined;
    const titleCell = (x: number, y: number) =>
      t !== undefined && y === t.y0 && x >= t.x0 - 1 && x <= t.x1 + 1;
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++) {
        const side = x === r.x0 || x === r.x1;
        const rule = y === r.y0 || y === r.y1;
        if ((!side && !rule) || titleCell(x, y)) continue;
        const glyph = at(x, y);
        let ok: boolean;
        if (side && rule) ok = g.corner.includes(glyph);
        else if (crossed.has(`${x},${y}`)) ok = glyph === g.crossing;
        else ok = (side ? g.side : g.rule).includes(glyph);
        if (!ok) fault(`${b.id}: ${JSON.stringify(glyph)} on its frame at (${x}, ${y})`);
      }
    if (t && !c.row(t.y0, t.x0, t.x1 + 1).includes(lineText(b.label, 0)))
      fault(`${b.id}: title ${JSON.stringify(lineText(b.label, 0))} not on its row`);
  }
}

/** The corners a box of `v` has. */
function cornersOf(cs: Charset, v: UsecaseNodeView): string {
  if (cs === 'ascii') return '++++';
  return v.kind === 'usecase' && v.shape === 'ellipse' ? '╭╮╰╯' : '┌┐└┘';
}

/** Nodes: D478's shapes where the layout puts them, every label line inside. */
function checkNodes(c: Ctx): void {
  const { at, fault } = c;
  for (const v of c.layout.usecase.nodes.values()) {
    const r = c.rects.get(v.id);
    if (!r) continue;
    if (v.kind === 'actor') {
      const top = offset(r, v).y + v.glyphTop;
      const x = figureX(r);
      const figure = [0, 1, 2].map((k) => c.row(top + k, x, x + 2));
      // A line across may run on through the blanks beside the head, up to it.
      figure[0] = figure[0]!.replace(/^[^O]/, ' ').replace(/[^O]$/, ' ');
      if (figure.join('|') !== ' O |/|\\|/ \\') fault(`${v.id}: figure ${JSON.stringify(figure)}`);
      hasLabel(c, r, v.stereotype, v.id);
      hasLabel(c, r, v.label, v.id);
      continue;
    }
    const corners = [at(r.x0, r.y0), at(r.x1, r.y0), at(r.x0, r.y1), at(r.x1, r.y1)].join('');
    if (corners !== cornersOf(c.cs, v)) fault(`${v.id}: corners ${JSON.stringify(corners)}`);
    if (v.kind === 'usecase') {
      const [open, close] = v.shape === 'rect' ? ['[', ']'] : ['(', ')'];
      let sides = 0;
      for (let y = r.y0 + 1; y < r.y1; y++)
        if (at(r.x0, y) === open && at(r.x1, y) === close) sides++;
      if (sides < v.block.height) fault(`${v.id}: ${sides} rows read ${open} … ${close}`);
      hasLabel(c, r, v.stereotype, v.id);
    }
    if (v.kind !== 'json') hasLabel(c, r, v.label, v.id);
    else
      for (const l of [v.title, ...v.rows.flatMap((jr) => [jr.key, jr.value])])
        hasLabel(c, r, l, v.id);
  }
  for (const e of c.layout.usecase.edges) {
    const r = labelRect(c.layout, e);
    if (r && e.kind === 'relation') hasLabel(c, r, e.label, e.id);
  }
}

/** The glyph a marker draws pointing `into`, if any. */
function markerGlyph(g: Glyphs, marker: Marker, into: Way): string | undefined {
  switch (marker) {
    case 'point':
      return g.head[into];
    case 'extension':
      return g.triangle[into];
    case 'circle':
      return g.circle;
    case 'cross':
      return g.cross;
    case 'none':
      return undefined;
  }
}

const isMarker = (g: Glyphs, c: string): boolean =>
  Object.values(g.head).includes(c as never) ||
  Object.values(g.triangle).includes(c as never) ||
  c === g.circle ||
  c === g.cross;

/**
 * Where the end of a line shows its marker: its end cell, or beside an actor, across, the cell
 * the line runs on to through the blanks of the actor's box (up to its marker).
 */
function tipOf(c: Ctx, cell: Point, into: Way, node: string): Point {
  const view = c.layout.usecase.nodes.get(node);
  const r = c.rects.get(node);
  if (view?.kind !== 'actor' || !r || (into !== 'left' && into !== 'right')) return cell;
  const step = STEP[into];
  const runs = (s: string) => c.g.line.includes(s) || s === '|' || s === '-' || isMarker(c.g, s);
  let tip = cell;
  while (
    !isMarker(c.g, c.at(tip.x, tip.y)) &&
    tip.x + step.x >= r.x0 &&
    tip.x + step.x <= r.x1 &&
    runs(c.at(tip.x + step.x, tip.y))
  )
    tip = { x: tip.x + step.x, y: tip.y };
  return tip;
}

/** One end: its marker at its tip, and in ascii a generalization's bar before it. */
function checkEnd(c: Ctx, e: UsecaseEdgeView, cells: Point[], first: boolean, tips: Set<string>) {
  const ports = c.layout.edges.get(e.id)!.ports;
  const i = first ? 0 : cells.length - 1;
  // The markers the layout gave the line (v12 `ARROW_TYPE`; a generalization's triangle).
  const marker = first ? e.markers.start : e.markers.end;
  const node = first ? e.source : e.target;
  const into = INTO[first ? ports.source : ports.target]!;
  const tip = tipOf(c, cells[i]!, into, node);
  tips.add(`${tip.x},${tip.y}`);
  const want = markerGlyph(c.g, marker, into);
  const glyph = c.at(tip.x, tip.y);
  if (want !== undefined && glyph !== want)
    c.fault(`${e.id}: ${JSON.stringify(glyph)} at its ${node} end, not ${want}`);
  if (marker !== 'extension' || c.cs !== 'ascii' || cells.length <= 2) return;
  const step = STEP[into];
  const back = { x: tip.x - step.x, y: tip.y - step.y };
  const prev = cells[first ? 1 : cells.length - 2]!;
  const straight = tip !== cells[i] || (prev.x === back.x && prev.y === back.y);
  const bar = into === 'left' || into === 'right' ? '|' : '-';
  tips.add(`${back.x},${back.y}`);
  if (straight && c.at(back.x, back.y) !== bar)
    c.fault(`${e.id}: ${JSON.stringify(c.at(back.x, back.y))} before its triangle, not ${bar}`);
}

/** Lines: each end's marker; dotted for include, extend and notes, solid otherwise. */
function checkLines(c: Ctx): number {
  let ends = 0;
  const labelled = new Set<string>();
  for (const e of c.layout.usecase.edges) {
    const r = labelRect(c.layout, e);
    if (!r) continue;
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) labelled.add(`${x},${y}`);
  }
  for (const e of c.layout.usecase.edges) {
    const route = c.routes.get(e.id);
    if (!route || !c.layout.edges.has(e.id)) continue;
    const cells = walk(route);
    const tips = new Set<string>();
    checkEnd(c, e, cells, true, tips);
    checkEnd(c, e, cells, false, tips);
    ends += 2;
    // Straight runs show the line's own stroke (crossings, ends and label patches aside).
    const [want, other] = e.dotted ? [c.g.dotted, c.g.solid] : [c.g.solid, c.g.dotted];
    for (const p of cells) {
      if (tips.has(`${p.x},${p.y}`) || labelled.has(`${p.x},${p.y}`)) continue;
      const glyph = c.at(p.x, p.y);
      if (other.includes(glyph) && !want.includes(glyph))
        c.fault(`${e.id}: ${JSON.stringify(glyph)} on a ${e.dotted ? 'dotted' : 'solid'} line`);
    }
  }
  return ends;
}

/** Checks the text `out` (charset `cs`) against the layout it was drawn from. */
export function readUsecase(out: string, cs: Charset, layout: UsecaseCellLayout): ReadBack {
  const { routes } = repairRoutes(layout.usecase.graph, layout);
  const rects = new Map<string, Rect>();
  for (const [id, n] of layout.nodes) rects.set(id, rectOf(n));
  const frames = new Map<string, Rect>();
  for (const [id, b] of layout.groups) frames.set(id, rectOf(b));
  const o = origin(layout, routes, rects);
  // The title, when there is one, is the first line, over the drawing.
  const titled = (layout.usecase.title?.width ?? 0) > 0 ? 1 : 0;
  const rows = out.split('\n').slice(titled).map(cellsOfLine);
  const at = (x: number, y: number): string => rows[y - o.y]?.[x - o.x] ?? ' ';
  const faults: string[] = [];
  const c: Ctx = {
    cs,
    g: GLYPHS[cs],
    layout,
    routes,
    rects,
    frames,
    at,
    row: (y, x0, x1) => {
      let s = '';
      for (let x = x0; x <= x1; x++) s += at(x, y);
      return s.replace(/\p{Cc}/gu, '');
    },
    fault: (s) => void faults.push(s),
  };
  checkFrames(c);
  checkNodes(c);
  const ends = checkLines(c);
  return { faults, ends };
}
