// The block diagram's text grid (D449): boxes on a character grid, laid out from the model in
// cells. Each container's columns are one width, its widest child's per column (the widest
// label, cut at `labelCap`), and its rows one height, as v12 sized its cells; children fill their
// cells, composites are frames around their own grid, and spaces take their cells and draw
// nothing. Positions follow v12's grid (`columns`, spans, a block wider than the rest of its row
// keeping its width), but a frame grows to hold its widest row, so no box crosses a frame.
import { cellMeasurer, cellWidth, graphemes, type CellRect } from '@mermaid-js/core/ascii';
import type { AstId } from '@mermaid-js/core/parser-kit';
import { layoutLabel, Style, type InlineSpans, type MeasuredLabel } from '@mermaid-js/core/text';
import type { Block, BlockModel, BlockType } from '../model.ts';
import { BLOCK_TEXT_METRICS, type TextSpacing } from './metrics.ts';

/** One drawn block: a leaf box or a composite's frame. */
export interface TextBox {
  readonly id: string;
  readonly ast: AstId;
  readonly type: BlockType;
  readonly frame: boolean;
  /** Index of the enclosing frame in {@link BlockText.boxes}; undefined at the top level. */
  readonly parent?: number;
  readonly rect: CellRect;
  /** The label's lines as drawn: cut to the box with the mark (a frame's: one line). */
  readonly lines: readonly string[];
  /** Whether the label was written bold or italic (text has neither). */
  readonly emphasis: boolean;
}

/** The laid-out grid: boxes in pre-order (each frame before its children). */
export interface BlockText {
  readonly boxes: readonly TextBox[];
  readonly width: number;
  readonly height: number;
}

export interface GridOptions {
  readonly spacing: TextSpacing;
  /** `ascii.maxWidth`: labels are cut shorter until the drawing fits, down to `minLabel`. */
  readonly maxWidth?: number;
  /** The cut mark: `…`, or `~` in the `ascii` charset. */
  readonly mark: string;
  readonly inline?: InlineSpans;
}

/** The cell measurer ignores the font; one key serves every label. */
const FONT = { family: '', size: 1, weight: 400 } as const;

/** A label as one cell text per line, and whether it is bold or italic. */
export interface TextLabel {
  readonly lines: readonly string[];
  readonly width: number;
  readonly emphasis: boolean;
}

export function textLabel(text: string, inline?: InlineSpans): TextLabel {
  if (text === '') return { lines: [], width: 0, emphasis: false };
  const m: MeasuredLabel = layoutLabel(
    text,
    FONT,
    Infinity,
    cellMeasurer,
    inline ? { inline } : {}
  );
  const lines = m.lines.map((runs) =>
    runs
      .map((r) => r.text)
      .join('')
      .trim()
  );
  return {
    lines,
    width: Math.max(0, ...lines.map(cellWidth)),
    emphasis: m.lines.some((l) => l.some((r) => (r.style & (Style.Bold | Style.Italic)) !== 0)),
  };
}

/** `text` cut to `width` cells, ending in `mark` when it was cut. */
export function cut(text: string, width: number, mark: string): string {
  if (cellWidth(text) <= width) return text;
  if (width <= 0) return '';
  let out = '';
  let used = 0;
  for (const g of graphemes(text)) {
    if (used + g.width > width - 1) break;
    out += g.text;
    used += g.width;
  }
  return out + mark;
}

/** A node of the text tree: a block, or a run of space cells. */
interface Node {
  readonly block: Block;
  readonly frame: boolean;
  readonly label: TextLabel;
  /** Columns taken; a space's run counts its cells one column each. */
  readonly span: number;
  readonly cells: number;
  readonly children: Node[];
  /** Natural size, then the drawn one. */
  w: number;
  h: number;
  /** A frame's grid: columns, column width, row heights, each child's column and row. */
  grid?: Grid;
}

interface Grid {
  readonly columns: number;
  readonly rows: number;
  readonly cw: number;
  /** Each row's height: its tallest box's. */
  readonly rh: readonly number[];
  /** Per child: its grid column, and its row among the rows that hold a box (-1: none). */
  readonly at: readonly { readonly px: number; readonly row: number }[];
}

const isSpace = (b: Block): boolean => b.type === 'space';
const isFrame = (b: Block): boolean => b.type === 'composite' || b.children.length > 0;

function tree(blocks: readonly Block[], inline: InlineSpans | undefined): Node[] {
  return blocks.map((block) => ({
    block,
    frame: !isSpace(block) && isFrame(block),
    label: isSpace(block) ? textLabel('') : textLabel(block.label, inline),
    span: isSpace(block) ? 1 : block.span,
    cells: isSpace(block) ? Math.max(0, block.cells ?? 1) : 1,
    children: tree(block.children, inline),
    w: 0,
    h: 0,
  }));
}

/**
 * v12's grid positions of `children` (`calculateBlockPosition`, `columnsFilled`): each child's
 * column and row; a space's run takes its cells one column each.
 */
function positions(children: readonly Node[], columns: number) {
  const at: { px: number; py: number }[] = [];
  let pos = 0;
  let widest = 0;
  const cellOf = (p: number): { px: number; py: number } => {
    if (columns <= 0) return { px: p, py: 0 };
    if (columns === 1) return { px: 0, py: p };
    return { px: p % columns, py: Math.floor(p / columns) };
  };
  const advance = (p: number, span: number): number =>
    p + (columns > 0 ? Math.min(span, columns - (p % columns)) : span);
  for (const c of children) {
    at.push(cellOf(pos));
    if (isSpace(c.block)) {
      // A run of one-column cells.
      for (let k = 0; k < c.cells; k++) {
        widest = Math.max(widest, cellOf(pos).px + 1);
        pos = advance(pos, 1);
      }
      continue;
    }
    widest = Math.max(widest, cellOf(pos).px + c.span);
    pos = advance(pos, c.span);
  }
  return { at, widest };
}

/** Natural sizes, bottom up. */
function measure(node: Node, s: TextSpacing, cap: number): void {
  if (!node.frame) {
    if (isSpace(node.block)) return;
    const t = Math.max(1, Math.min(node.label.width, cap));
    node.w = t + 2 * s.padX + 2;
    node.h = Math.max(1, node.label.lines.length) + 2 * s.padY + 2;
    return;
  }
  for (const c of node.children) measure(c, s, cap);
  node.grid = gridOf(node.children, node.block.columns ?? -1, s);
  const { w, h } = inner(node.grid, s);
  const title =
    node.label.width > 0 ? Math.min(node.label.width, cap) + BLOCK_TEXT_METRICS.titleFrame : 0;
  node.w = Math.max(w + 2 * s.marginX + 2, title, 4);
  node.h = h + 2 * s.marginY + 2;
}

/**
 * The grid of `children`: one column width, the widest child's per column (D449), and each
 * row as tall as its tallest child.
 */
function gridOf(children: readonly Node[], columns: number, s: TextSpacing): Grid {
  const { at, widest } = positions(children, columns);
  let cw = 0;
  for (const c of children) {
    if (isSpace(c.block)) continue;
    cw = Math.max(cw, Math.ceil((c.w - (c.span - 1) * s.gapX) / c.span));
  }
  // Rows that hold a box, in order; a row of spaces alone takes no room (v12).
  const used = [...new Set(children.flatMap((c, i) => (isSpace(c.block) ? [] : [at[i]!.py])))].sort(
    (a, b) => a - b
  );
  const index = new Map(used.map((py, i) => [py, i]));
  const rh = used.map(() => 0);
  children.forEach((c, i) => {
    const row = index.get(at[i]!.py);
    if (!isSpace(c.block) && row !== undefined) rh[row] = Math.max(rh[row]!, c.h);
  });
  return {
    columns: widest,
    rows: used.length,
    cw,
    rh,
    at: at.map((p) => ({ px: p.px, row: index.get(p.py) ?? -1 })),
  };
}

function inner(g: Grid, s: TextSpacing): { w: number; h: number } {
  return {
    w: g.columns > 0 ? g.columns * g.cw + (g.columns - 1) * s.gapX : 0,
    h: g.rows > 0 ? g.rh.reduce((a, b) => a + b, 0) + (g.rows - 1) * s.gapY : 0,
  };
}

/** Stretches a grid over `area` and hands each child its cell, top down. */
function place(
  children: readonly Node[],
  g: Grid,
  area: CellRect,
  s: TextSpacing,
  out: (node: Node, rect: CellRect) => void
): void {
  const cw =
    g.columns > 0
      ? Math.max(g.cw, Math.floor((area.width - (g.columns - 1) * s.gapX) / g.columns))
      : 0;
  // Height to spare goes to the rows evenly, the remainder to the last.
  const spare = Math.max(0, area.height - inner(g, s).h);
  const rh = g.rh.map(
    (h, i) => h + Math.floor(spare / g.rows) + (i === g.rows - 1 ? spare % g.rows : 0)
  );
  const top: number[] = [];
  let y = area.y;
  for (const h of rh) {
    top.push(y);
    y += h + s.gapY;
  }
  children.forEach((c, i) => {
    const { px, row } = g.at[i]!;
    if (isSpace(c.block) || row < 0) return;
    const cell: CellRect = {
      x: area.x + px * (cw + s.gapX),
      y: top[row]!,
      width: c.span * cw + (c.span - 1) * s.gapX,
      height: rh[row]!,
    };
    out(c, cell);
  });
}

/** A frame's title: its label on one line, cut to `width`; none for an unlabelled frame. */
const titleLines = (label: TextLabel, width: number, mark: string): string[] =>
  label.width > 0 ? [cut(label.lines.join(' '), width, mark)] : [];

/** The grid of `model` in cells, labels cut at `cap`. */
function layout(model: BlockModel, nodes: Node[], o: GridOptions, cap: number): BlockText {
  const s = o.spacing;
  for (const n of nodes) measure(n, s, cap);
  const g = gridOf(nodes, model.columns, s);
  const size = inner(g, s);
  const boxes: TextBox[] = [];
  const visit = (node: Node, rect: CellRect, parent: number | undefined): void => {
    const index = boxes.length;
    const width = rect.width;
    const lines = node.frame
      ? titleLines(node.label, Math.min(cap, width - BLOCK_TEXT_METRICS.titleFrame), o.mark)
      : node.label.lines.map((l) => cut(l, Math.min(cap, width - 2 - 2 * s.padX), o.mark));
    boxes.push({
      id: node.block.id,
      ast: node.block.ast,
      type: node.block.type,
      frame: node.frame,
      ...(parent !== undefined ? { parent } : {}),
      rect,
      lines,
      emphasis: node.label.emphasis,
    });
    if (!node.frame) return;
    const area: CellRect = {
      x: rect.x + 1 + s.marginX,
      y: rect.y + 1 + s.marginY,
      width: rect.width - 2 - 2 * s.marginX,
      height: rect.height - 2 - 2 * s.marginY,
    };
    place(node.children, node.grid!, area, s, (c, cell) => visit(c, cell, index));
  };
  const all: CellRect = { x: 0, y: 0, width: size.w, height: size.h };
  place(nodes, g, all, s, (c, cell) => visit(c, cell, undefined));
  return { boxes, width: size.w, height: size.h };
}

/**
 * Lays `model` out on the text grid (D449). With `maxWidth`, labels are cut shorter, down to
 * `minLabel` cells, until the drawing fits; one that still does not is drawn whole (the API's
 * `ASCII_TOO_WIDE`, D84).
 */
export function blockTextGrid(model: BlockModel, options: GridOptions): BlockText {
  const nodes = tree(model.blocks, options.inline);
  const { labelCap, minLabel } = BLOCK_TEXT_METRICS;
  const full = layout(model, nodes, options, labelCap);
  const max = options.maxWidth;
  if (max === undefined || full.width <= max) return full;
  // The widest cap that fits: the width only grows with the cap.
  let lo = minLabel;
  let hi = labelCap - 1;
  let best: BlockText | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = layout(model, nodes, options, mid);
    if (t.width <= max) {
      best = t;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best ?? layout(model, nodes, options, minLabel);
}
