// The block diagram's text grid (D449): boxes on a character grid, laid out from the model in
// cells. Each container's columns are one width, its widest child's per column (the widest
// label, cut at `labelCap`), and its rows one height, as v12 sized its cells; children fill their
// cells, composites are frames around their own grid, and spaces take their cells and draw
// nothing. Positions follow v12's grid (`columns`, spans, a block wider than the rest of its row
// keeping its width), but a frame grows to hold its widest row, so no box crosses a frame.
import { cellMeasurer, cellWidth, graphemes, type CellRect } from '@mermaid-js/core/ascii';
import type { AstId } from '@mermaid-js/core/parser-kit';
import { layoutLabel, Style, type InlineSpans, type MeasuredLabel } from '@mermaid-js/core/text';
import { gridAdvance, gridPosition } from '../layout/grid.ts';
import { isComposite, type Block, type BlockModel, type BlockType } from '../model.ts';
import { arrowSides, type ArrowSide } from '../shapes/block-arrow.ts';
import { BLOCK_TEXT_METRICS, type TextSpacing } from './metrics.ts';

/**
 * One drawn block: a leaf box or a composite's frame. A leaf that holds children (a composite a
 * later mention turned into a leaf type) is its own box, its children below it in the same
 * frame (`parent` is that frame).
 */
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
  /** A block arrow's sides it points to, each once (`x` and `y` expanded). */
  readonly directions?: readonly ArrowSide[];
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
  /** Drawn as a frame around its children ({@link isComposite}). */
  readonly frame: boolean;
  readonly label: TextLabel;
  /** Columns taken; a space's run counts its cells one column each. */
  readonly span: number;
  readonly cells: number;
  readonly children: Node[];
  /** Natural size, then the drawn one. */
  w: number;
  h: number;
  /**
   * A leaf's own box height. A leaf a later mention made of a composite keeps its children
   * (v12's merge rule): its box is drawn at the top of its cell and their grid below it.
   */
  box: number;
  /** The grid of the node's children: columns, column width, row heights, each child's cell. */
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

function nodeOf(block: Block, inline: InlineSpans | undefined): Node {
  const space = isSpace(block);
  return {
    block,
    frame: !space && isComposite(block),
    label: space ? textLabel('') : textLabel(block.label, inline),
    span: space ? 1 : block.span,
    cells: space ? Math.max(0, block.cells ?? 1) : 1,
    children: [],
    w: 0,
    h: 0,
    box: 0,
  };
}

/** The text tree of `blocks`, and every node in pre-order, without recursion. */
function tree(blocks: readonly Block[], inline: InlineSpans | undefined) {
  const roots = blocks.map((b) => nodeOf(b, inline));
  const order: Node[] = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    order.push(node);
    for (const c of node.block.children) node.children.push(nodeOf(c, inline));
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
  }
  return { roots, order };
}

/**
 * v12's grid positions of `children` (`calculateBlockPosition`, `columnsFilled`, the px
 * layout's rules): each child's column and row; a space's run takes its cells one column each.
 */
function positions(children: readonly Node[], columns: number) {
  const at: { px: number; py: number }[] = [];
  let pos = 0;
  let widest = 0;
  for (const c of children) {
    at.push(gridPosition(columns, pos));
    if (isSpace(c.block)) {
      // A run of one-column cells.
      for (let k = 0; k < c.cells; k++) {
        widest = Math.max(widest, gridPosition(columns, pos).px + 1);
        pos = gridAdvance(columns, pos, 1);
      }
      continue;
    }
    widest = Math.max(widest, gridPosition(columns, pos).px + c.span);
    pos = gridAdvance(columns, pos, c.span);
  }
  return { at, widest };
}

/** One node's natural size, from its children's (measured first). */
function measure(node: Node, s: TextSpacing, cap: number): void {
  if (isSpace(node.block)) return;
  const kids = node.children.length > 0;
  if (kids) node.grid = gridOf(node.children, node.block.columns ?? -1, s);
  const inside = node.grid ? inner(node.grid, s) : { w: 0, h: 0 };
  if (!node.frame) {
    const t = Math.max(1, Math.min(node.label.width, cap));
    node.box = Math.max(1, node.label.lines.length) + 2 * s.padY + 2;
    node.w = Math.max(t + 2 * s.padX + 2, inside.w);
    node.h = node.box + (inside.h > 0 ? s.gapY + inside.h : 0);
    return;
  }
  const title =
    node.label.width > 0 ? Math.min(node.label.width, cap) + BLOCK_TEXT_METRICS.titleFrame : 0;
  node.w = Math.max(inside.w + 2 * s.marginX + 2, title, 4);
  node.h = inside.h + 2 * s.marginY + 2;
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

/** Stretches a grid over `area`: each drawn child and its cell, in order. */
function place(
  children: readonly Node[],
  g: Grid,
  area: CellRect,
  s: TextSpacing
): [Node, CellRect][] {
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
  const out: [Node, CellRect][] = [];
  children.forEach((c, i) => {
    const { px, row } = g.at[i]!;
    if (isSpace(c.block) || row < 0) return;
    out.push([
      c,
      {
        x: area.x + px * (cw + s.gapX),
        y: top[row]!,
        width: c.span * cw + (c.span - 1) * s.gapX,
        height: rh[row]!,
      },
    ]);
  });
  return out;
}

/** A frame's title: its label on one line, cut to `width`; none for an unlabelled frame. */
const titleLines = (label: TextLabel, width: number, mark: string): string[] =>
  label.width > 0 ? [cut(label.lines.join(' '), width, mark)] : [];

/** Where a node's children go in its cell: inside a frame, or below a leaf's own box. */
function childArea(node: Node, cell: CellRect, s: TextSpacing): CellRect {
  if (!node.frame) {
    const y = cell.y + node.box + s.gapY;
    return { x: cell.x, y, width: cell.width, height: cell.y + cell.height - y };
  }
  return {
    x: cell.x + 1 + s.marginX,
    y: cell.y + 1 + s.marginY,
    width: cell.width - 2 - 2 * s.marginX,
    height: cell.height - 2 - 2 * s.marginY,
  };
}

/** The grid of `model` in cells, labels cut at `cap`. Iterative: composites nest thousands deep. */
function layout(model: BlockModel, t: ReturnType<typeof tree>, o: GridOptions, cap: number) {
  const s = o.spacing;
  // Children before their parents: pre-order backwards.
  for (let i = t.order.length - 1; i >= 0; i--) measure(t.order[i]!, s, cap);
  const g = gridOf(t.roots, model.columns, s);
  const size = inner(g, s);
  const boxes: TextBox[] = [];
  const stack: { node: Node; cell: CellRect; parent: number | undefined }[] = [];
  const push = (cells: [Node, CellRect][], parent: number | undefined): void => {
    for (let i = cells.length - 1; i >= 0; i--)
      stack.push({ node: cells[i]![0], cell: cells[i]![1], parent });
  };
  push(place(t.roots, g, { x: 0, y: 0, width: size.w, height: size.h }, s), undefined);
  while (stack.length > 0) {
    const { node, cell, parent } = stack.pop()!;
    const index = boxes.length;
    const rect = node.frame || !node.grid ? cell : { ...cell, height: node.box };
    const lines = node.frame
      ? titleLines(node.label, Math.min(cap, rect.width - BLOCK_TEXT_METRICS.titleFrame), o.mark)
      : node.label.lines.map((l) => cut(l, Math.min(cap, rect.width - 2 - 2 * s.padX), o.mark));
    const { block } = node;
    boxes.push({
      id: block.id,
      ast: block.ast,
      type: block.type,
      frame: node.frame,
      ...(parent !== undefined ? { parent } : {}),
      rect,
      lines,
      emphasis: node.label.emphasis,
      ...(block.type === 'block_arrow'
        ? { directions: [...arrowSides(block.directions ?? [])] }
        : {}),
    });
    // A leaf's children are not in it: they sit in the frame around it.
    if (node.grid)
      push(
        place(node.children, node.grid, childArea(node, cell, s), s),
        node.frame ? index : parent
      );
  }
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
