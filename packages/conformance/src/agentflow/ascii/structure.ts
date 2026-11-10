// Reads an agentflow text drawing back against the cell layout it was drawn from (#551, D469),
// for the corpus and fuzz suites: where each node, frame, label and line end must be, and what
// each must look like there. Independent of the drawing code: positions come from the layout
// and the repaired routes, glyphs from D469 and core's glyph tables.
import { ascii, glyphFor, graphemes, repairRoutes, unicode } from '@mermaid-js/core/ascii';
import type { Point, Side } from '@mermaid-js/core/layout';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { AgentflowLayout, AgentflowNodeView } from '@mermaid-js/diagram-agentflow';

export type Charset = 'unicode' | 'ascii';

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

// Arms as core packs them: up·64 + right·16 + down·4 + left, two bits each; here any weight.
const UP = 0xc0;
const RIGHT = 0x30;
const DOWN = 0x0c;
const LEFT = 0x03;
const H = RIGHT | LEFT;
const V = UP | DOWN;
const ALL = H | V;

const armsOf = (code: number): number =>
  (code & 0xc0 ? UP : 0) |
  (code & 0x30 ? RIGHT : 0) |
  (code & 0x0c ? DOWN : 0) |
  (code & 3 ? LEFT : 0);

const UNICODE_ARMS = new Map<string, number>();
for (let code = 1; code < 256; code++) {
  const glyph = glyphFor(code, unicode);
  if (glyph !== undefined && !UNICODE_ARMS.has(glyph)) UNICODE_ARMS.set(glyph, armsOf(code));
}
for (const [glyphs, arms] of [
  ['╭', RIGHT | DOWN],
  ['╮', LEFT | DOWN],
  ['╰', UP | RIGHT],
  ['╯', UP | LEFT],
  ['┄', H],
  ['┆', V],
] as const)
  for (const g of glyphs) UNICODE_ARMS.set(g, arms);
const ASCII_ARMS = new Map<string, number>([
  ['-', H],
  ['.', H],
  ['|', V],
  [':', V],
  ['I', V],
  ['+', ALL],
]);

/** Which way each direction index points, and the arm a line has towards it. */
const STEP = [
  { dx: 0, dy: -1, arm: UP, head: 'up' },
  { dx: 1, dy: 0, arm: RIGHT, head: 'right' },
  { dx: 0, dy: 1, arm: DOWN, head: 'down' },
  { dx: -1, dy: 0, arm: LEFT, head: 'left' },
] as const;
/** The direction from an end cell into the box behind it, by the side the end is on. */
const INTO: Record<Side, number> = { top: 2, right: 3, bottom: 0, left: 1 };

/** The corners (top-left, top-right, bottom-left, bottom-right) of each text form (D469). */
function corners(shape: AgentflowNodeView['shape'], cs: Charset): string {
  if (cs === 'ascii') return shape === 'lin-doc' ? '+\\++' : '++++';
  if (shape === 'rounded') return '╭╮╰╯';
  if (shape === 'fr-rect') return '╓╖╙╜';
  if (shape === 'lin-doc') return '┌╲└┘';
  return '┌┐└┘';
}

/** The side marks of each text form, by side (top, right, bottom, left). */
function marks(shape: AgentflowNodeView['shape'], cs: Charset): (string | undefined)[] {
  const diamond = cs === 'unicode' ? '◇' : '*';
  if (shape === 'diam') return [diamond, diamond, diamond, diamond];
  if (shape === 'hex') return [undefined, '>', undefined, '<'];
  if (shape === 'lean-r') return [undefined, '/', undefined, '/'];
  return [];
}

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

const lineText = (l: MeasuredLabel, i: number, cs: Charset): string => {
  const text = (l.lines[i] ?? []).map((r) => r.text).join('');
  return (cs === 'ascii' && l.left ? text.replace(/^(\s*)[•◦]/, '$1-') : text).trim();
};

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

const onBorder = (r: Rect, x: number, y: number): boolean =>
  ((y === r.y0 || y === r.y1) && x >= r.x0 && x <= r.x1) ||
  ((x === r.x0 || x === r.x1) && y >= r.y0 && y <= r.y1);

export interface ReadBack {
  /** Every fault found, as text: `node:`, `frame:`, `label:`, `end:` or `stroke:` first. */
  faults: string[];
  /** Line ends checked. */
  ends: number;
}

interface End {
  id: string;
  cell: Point;
  /** Direction index from the end cell into its box. */
  into: number;
  marker: string;
  /** The node or flow it ends at. */
  at: string;
}

/** What every check reads: the layout's rectangles, the text as cells in layout coordinates. */
interface Ctx {
  readonly cs: Charset;
  readonly layout: AgentflowLayout;
  readonly nodes: ReadonlyMap<string, Rect>;
  readonly frames: ReadonlyMap<string, Rect>;
  readonly labels: ReadonlyMap<string, Rect>;
  /** Every placed edge's cells, in order. */
  readonly paths: ReadonlyMap<string, Point[]>;
  /** Edges the router found no lane for (D78): not read for their ends or strokes. */
  readonly unresolved: ReadonlySet<string>;
  /** The glyph at a layout cell. */
  readonly at: (x: number, y: number) => string;
  /** The line arms of the glyph at a layout cell, any weight. */
  readonly arms: (x: number, y: number) => number;
  /** A row's text from x0 to x1, trimmed. */
  readonly row: (y: number, x0: number, x1: number) => string;
  readonly fault: (s: string) => void;
}

const headsOf = (cs: Charset): string[] => {
  const { head, cross } = cs === 'unicode' ? unicode : ascii;
  return [head.up, head.right, head.down, head.left, cross];
};

/** The layout's rectangles and placed routes, by id. */
function shapes(layout: AgentflowLayout) {
  const prepared = layout.agentflow;
  const { routes, unresolved } = repairRoutes(prepared.graph, layout);
  const nodes = new Map<string, Rect>();
  for (const n of prepared.nodes) {
    const box = layout.nodes.get(n.id);
    if (box) nodes.set(n.id, rectOf(box));
  }
  const frames = new Map<string, Rect>();
  for (const g of prepared.groups) {
    const box = layout.groups.get(g.id);
    if (box) frames.set(g.id, rectOf(box));
  }
  const labels = new Map<string, Rect>();
  const paths = new Map<string, Point[]>();
  for (const e of prepared.edges) {
    const placed = layout.edges.get(e.id);
    if (placed?.label && e.label.width > 0) {
      const h = Math.max(e.label.height, 1);
      labels.set(e.id, rectOf({ ...placed.label, width: e.label.width, height: h }));
    }
    const r = routes.get(e.id);
    if (r && placed) paths.set(e.id, walk(r));
  }
  return { nodes, frames, labels, paths, unresolved: new Set(unresolved.map((c) => c.edge)) };
}

/**
 * Reads `text` (drawn in `cs`) back against the cell layout it was drawn from; `title` is the
 * front-matter title, drawn on the first line.
 */
export function readAgentflow(
  text: string,
  cs: Charset,
  layout: AgentflowLayout,
  title?: string
): ReadBack {
  const faults: string[] = [];
  const fault = (s: string): void => void faults.push(s);
  const table = cs === 'unicode' ? UNICODE_ARMS : ASCII_ARMS;
  const found = shapes(layout);
  // The drawing trims its empty margin: its origin is the topmost and leftmost drawn cell.
  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const r of [...found.nodes.values(), ...found.frames.values(), ...found.labels.values()]) {
    extend(r.x0, r.y0);
    extend(r.x1, r.y1);
  }
  for (const p of found.paths.values()) for (const c of p) extend(c.x, c.y);
  const rows = text === '' ? [] : text.split('\n').map(cellsOfLine);
  if (!Number.isFinite(minX))
    return { faults: rows.length > 1 ? ['drawing: no layout'] : [], ends: 0 };
  // A front-matter title is one line over the drawing (no `ascii.maxWidth` to wrap it to).
  const titleRows = rows.length - (maxY - minY + 1);
  const heading = title?.trim() ?? '';
  if (titleRows !== (heading ? 1 : 0))
    fault(`drawing: ${rows.length} rows for a layout ${maxY - minY + 1} high`);
  else if (heading && rows[0]!.join('').trim() !== heading)
    fault(`drawing: title reads ${JSON.stringify(rows[0]!.join('').trim())}`);
  const at = (x: number, y: number): string => rows[y - minY + titleRows]?.[x - minX] ?? ' ';
  const ctx: Ctx = {
    cs,
    layout,
    ...found,
    at,
    arms: (x, y) => table.get(at(x, y)) ?? 0,
    row: (y, x0, x1) => {
      let s = '';
      for (let x = x0; x <= x1; x++) s += at(x, y);
      return s.trim();
    },
    fault,
  };
  const ends = endsOf(ctx);
  checkNodes(ctx);
  checkFrames(ctx, ends);
  checkLabels(ctx);
  checkEnds(ctx, ends);
  checkStrokes(ctx);
  return { faults, ends: ends.filter((e) => !ctx.unresolved.has(e.id)).length };
}

/** Both ends of every placed edge. */
function endsOf({ layout, paths }: Ctx): End[] {
  const ends: End[] = [];
  for (const e of layout.agentflow.edges) {
    const cells = paths.get(e.id);
    const placed = layout.edges.get(e.id);
    if (!cells || cells.length === 0 || !placed) continue;
    ends.push(
      { id: e.id, cell: cells[0]!, into: INTO[placed.ports.source], marker: e.start, at: e.source },
      {
        id: e.id,
        cell: cells[cells.length - 1]!,
        into: INTO[placed.ports.target],
        marker: e.end,
        at: e.target,
      }
    );
  }
  return ends;
}

/** Nodes: the text form's corners, sides and marks (D469), and the label centred inside. */
function checkNodes(ctx: Ctx): void {
  const { cs, at, arms, row, fault } = ctx;
  for (const n of ctx.layout.agentflow.nodes) {
    const r = ctx.nodes.get(n.id);
    if (!r) continue;
    const [tl, tr, bl, br] = [...corners(n.shape, cs)];
    const want: [number, number, string][] = [
      [r.x0, r.y0, tl!],
      [r.x1, r.y0, tr!],
      [r.x0, r.y1, bl!],
      [r.x1, r.y1, br!],
    ];
    for (const [x, y, g] of want)
      if (at(x, y) !== g) fault(`node: ${n.id} corner at ${x},${y} is ${at(x, y)}, not ${g}`);
    const mark = marks(n.shape, cs);
    const midX = r.x0 + Math.floor((r.x1 - r.x0) / 2);
    const midY = r.y0 + Math.floor((r.y1 - r.y0) / 2);
    // A line leaving the box replaces a mark with a tee.
    const tee = (x: number, y: number, along: number) => {
      const a = arms(x, y);
      return (a & along) === along && (a & ~along) !== 0;
    };
    const check = (x: number, y: number, along: number, side: number, mid: boolean) => {
      const marker = n.shape === 'collapsedGroup' && side === 0 && x === r.x0 + 1;
      const m = (mid ? mark[side] : undefined) ?? (marker ? '+' : undefined);
      if (m !== undefined) {
        if (at(x, y) !== m && !tee(x, y, along))
          fault(`node: ${n.id} mark at ${x},${y} is ${at(x, y)}, not ${m}`);
      } else if ((arms(x, y) & along) !== along) {
        fault(`node: ${n.id} border at ${x},${y} is ${at(x, y)}`);
      }
    };
    for (let x = r.x0 + 1; x < r.x1; x++) {
      check(x, r.y0, H, 0, x === midX);
      check(x, r.y1, H, 2, x === midX);
    }
    for (let y = r.y0 + 1; y < r.y1; y++) {
      check(r.x0, y, V, 3, y === midY);
      check(r.x1, y, V, 1, y === midY);
    }
    const lines = n.label.lines.length;
    const top = r.y0 + Math.floor((r.y1 - r.y0 + 1 - lines) / 2);
    for (let i = 0; i < lines; i++) {
      const got = row(top + i, r.x0 + 1, r.x1 - 1);
      const line = lineText(n.label, i, cs);
      if (got !== line)
        fault(`node: ${n.id} line ${i} reads ${JSON.stringify(got)}, not ${JSON.stringify(line)}`);
    }
  }
}

/**
 * Frames: whole, with nothing on the border but lines and the title (pitfall 20). The one end a
 * frame may carry is the marker of an edge that ends at that flow from inside it.
 */
function checkFrames(ctx: Ctx, ends: readonly End[]): void {
  const { cs, at, arms, row, fault } = ctx;
  const heads = headsOf(cs);
  const own = new Set<string>();
  for (const end of ends) {
    const frame = ctx.frames.get(end.at);
    if (frame && end.marker !== 'none' && onBorder(frame, end.cell.x, end.cell.y))
      own.add(`${end.cell.x},${end.cell.y}`);
  }
  for (const g of ctx.layout.agentflow.groups) {
    const r = ctx.frames.get(g.id);
    const box = ctx.layout.groups.get(g.id);
    if (!r || !box) continue;
    let heading: Rect | undefined;
    if (g.label.width > 0) {
      heading = rectOf({ ...box.title, width: g.label.width, height: Math.max(g.label.height, 1) });
      if (heading.y0 !== r.y0) fault(`frame: ${g.id} title is off the top border`);
      const got = row(heading.y0, heading.x0, heading.x1);
      if (got !== lineText(g.label, 0, cs))
        fault(`frame: ${g.id} title reads ${JSON.stringify(got)}`);
    }
    const want = (x: number, y: number, need: number) => {
      if (heading && y === heading.y0 && x >= heading.x0 - 1 && x <= heading.x1 + 1) return;
      if (own.has(`${x},${y}`)) {
        if (!heads.includes(at(x, y))) fault(`frame: ${g.id} end at ${x},${y} is ${at(x, y)}`);
        return;
      }
      if ((arms(x, y) & need) !== need)
        fault(`frame: ${g.id} border at ${x},${y} is ${JSON.stringify(at(x, y))}`);
    };
    want(r.x0, r.y0, RIGHT | DOWN);
    want(r.x1, r.y0, LEFT | DOWN);
    want(r.x0, r.y1, RIGHT | UP);
    want(r.x1, r.y1, LEFT | UP);
    for (let x = r.x0 + 1; x < r.x1; x++) {
      want(x, r.y0, H);
      want(x, r.y1, H);
    }
    for (let y = r.y0 + 1; y < r.y1; y++) {
      want(r.x0, y, V);
      want(r.x1, y, V);
    }
  }
}

/** Edge labels: every line where the layout put it. */
function checkLabels({ cs, layout, labels, row, fault }: Ctx): void {
  for (const e of layout.agentflow.edges) {
    const r = labels.get(e.id);
    if (!r) continue;
    for (let i = 0; i < e.label.lines.length; i++) {
      const got = row(r.y0 + i, r.x0, r.x1);
      const line = lineText(e.label, i, cs);
      if (got !== line)
        fault(`label: ${e.id} line ${i} reads ${JSON.stringify(got)}, not ${JSON.stringify(line)}`);
    }
  }
}

/** Ends: a head (`-->`) or a cross (`--x`) in the end cell, else a line and a tee on the box. */
function checkEnds({ cs, frames, unresolved, at, arms, fault }: Ctx, ends: readonly End[]): void {
  const glyphs = cs === 'unicode' ? unicode : ascii;
  for (const end of ends) {
    if (unresolved.has(end.id)) continue;
    const { x, y } = end.cell;
    const frame = frames.get(end.at);
    const onFrame = frame !== undefined && onBorder(frame, x, y);
    // A marker on a flow's own frame is reached from inside, so it points the other way.
    const into = onFrame ? (end.into + 2) % 4 : end.into;
    const got = at(x, y);
    if (end.marker === 'arrow_point') {
      const head = glyphs.head[STEP[into]!.head];
      if (got !== head) fault(`end: ${end.id} at ${x},${y} is ${got}, not ${head}`);
    } else if (end.marker === 'arrow_cross') {
      if (got !== glyphs.cross) fault(`end: ${end.id} at ${x},${y} is ${got}, not ${glyphs.cross}`);
    } else if (!(arms(x, y) & STEP[end.into]!.arm)) {
      fault(`end: ${end.id} at ${x},${y} does not run into its box: ${got}`);
    } else if (!onFrame) {
      const s = STEP[end.into]!;
      const back = STEP[(end.into + 2) % 4]!.arm;
      if (!(arms(x + s.dx, y + s.dy) & back))
        fault(`end: ${end.id} has no tee at ${x + s.dx},${y + s.dy}: ${at(x + s.dx, y + s.dy)}`);
    }
  }
}

/** Strokes: `-.-` dotted, the others solid, on every straight cell no other line shares. */
function checkStrokes({ cs, layout, frames, labels, paths, unresolved, at, fault }: Ctx): void {
  const glyphs = cs === 'unicode' ? unicode : ascii;
  const used = new Map<string, number>();
  for (const p of paths.values())
    for (const c of p) used.set(`${c.x},${c.y}`, (used.get(`${c.x},${c.y}`) ?? 0) + 1);
  const covered = (x: number, y: number) =>
    [...frames.values()].some((r) => onBorder(r, x, y)) ||
    [...labels.values()].some((r) => y >= r.y0 && y <= r.y1 && x >= r.x0 - 1 && x <= r.x1 + 1);
  for (const e of layout.agentflow.edges) {
    const cells = paths.get(e.id);
    if (!cells || unresolved.has(e.id)) continue;
    const set = e.edge.stroke === 'dotted' ? glyphs.dotted : glyphs.solid;
    for (let i = 1; i < cells.length - 1; i++) {
      const [a, c, b] = [cells[i - 1]!, cells[i]!, cells[i + 1]!];
      const across = a.y === c.y && c.y === b.y;
      const down = a.x === c.x && c.x === b.x;
      if ((!across && !down) || used.get(`${c.x},${c.y}`) !== 1 || covered(c.x, c.y)) continue;
      const want = across ? set.h : set.v;
      if (at(c.x, c.y) !== want)
        fault(`stroke: ${e.id} at ${c.x},${c.y} is ${at(c.x, c.y)}, not ${want}`);
    }
  }
}
