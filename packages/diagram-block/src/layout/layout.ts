/**
 * The block custom layout (spec #521 T3, `layoutKind: 'custom'`): `BlockModel` in, `BlockLayout`
 * out. Every label is measured first, through the injected measurer in the font it is drawn in
 * (pitfall 16), and never wrapped (v12 passed `wrappingWidth: Infinity`); a leaf's natural size
 * is its label plus its shape's padding (the theme's rows over `block.padding`, D152). The grid
 * is v12's (`grid.ts`), linear in blocks and depth. Then each block gets its outline (filling
 * its cell or keeping its size, spec #521 §Stretch; `kinds.ts`), edges are clipped at the
 * outlines (D441), and the bounds cover everything drawn plus v12's 5 px (D224). Lengths come
 * from the `block` config and the metrics table (pitfall 13).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { BLOCK_CONFIG_INVALID } from '../codes.ts';
import { checkStyle } from '@mermaid-js/core/svg';
import { fontSizePx, layoutLabel, Style, type FontKey } from '@mermaid-js/core/text';
import { isComposite, type Block, type BlockEdge, type BlockModel } from '../model.ts';
import { themePads, type Pads } from '@mermaid-js/shared/shapes/kit';
import { clipOutline, outlineExtent, type Point } from '../shapes/outline.ts';
import { placeGrid, sizeGrid, type GridNode } from './grid.ts';
import { kindOf, SHAPE_OF, type Natural } from './kinds.ts';
import { BLOCK_METRICS, CUBIC_MIDDLE, NORMAL_WEIGHT } from './metrics.ts';
import type {
  BlockEdgeLayout,
  BlockLayout,
  BlockNodeLayout,
  BlockShape,
  PlacedLabel,
  Rect,
} from './types.ts';
import { shownValue as shown } from '@mermaid-js/shared/config/readers';

/** What the layout reads from the render context (`warn` for `BLOCK_CONFIG_INVALID`). */
export type BlockLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

/** A measured label before it is placed. */
type Measured = Omit<PlacedLabel, 'x' | 'y'>;
type Measure = (text: string, font: FontKey, style: number) => Measured;

/** One grid node and what the layout needs to draw it. */
interface Item extends BlockGridItem {
  /** The model block; for a space's cell, the space. */
  readonly block: Block;
  readonly parent?: number;
  readonly label?: Measured;
  /** Its natural size, label shift and band, as its kind measures it. */
  readonly natural: Natural;
}

/**
 * `block.padding` from the config (D226, D445): a finite number of 0 or more, at most
 * `BLOCK_METRICS.maxPadding`. Anything else lays out at the default (a negative padding would
 * overlap the cells it separates), and a larger one at the maximum, each with one
 * `BLOCK_CONFIG_INVALID` to `warn`.
 */
export function blockPadding(
  config: BlockLayoutContext['config'],
  warn?: (w: Warning) => void
): number {
  const p = (config as { block?: { padding?: unknown } }).block?.padding;
  if (p === undefined) return BLOCK_METRICS.padding;
  const invalid = (message: string): Warning => ({
    code: BLOCK_CONFIG_INVALID,
    message,
    path: 'block.padding',
  });
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0) {
    warn?.(
      invalid(
        `block.padding is ${shown(p)}, not a finite number of 0 or more; using ${BLOCK_METRICS.padding}`
      )
    );
    return BLOCK_METRICS.padding;
  }
  if (p > BLOCK_METRICS.maxPadding) {
    warn?.(
      invalid(
        `block.padding is ${p}, over ${BLOCK_METRICS.maxPadding}; using ${BLOCK_METRICS.maxPadding}`
      )
    );
    return BLOCK_METRICS.maxPadding;
  }
  return p;
}

/** The base font and, per class list and own styles, the font a block's label is drawn in. */
function fonts(model: BlockModel, ctx: BlockLayoutContext) {
  const base: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: NORMAL_WEIGHT,
  };
  const classDefs = new Map<string, readonly string[]>();
  for (const c of model.classDefs) classDefs.set(c.id, [...c.styles, ...c.textStyles]);
  const cache = new Map<string, [FontKey, number]>();
  const fontOf = (block: Block): [FontKey, number] => {
    // v12 looked each `class` statement's text up as one name (`classDb.get(className)`).
    const decls: string[] = [];
    for (const name of block.classes) for (const s of classDefs.get(name) ?? []) decls.push(s);
    for (const s of block.styles) decls.push(s);
    const key = decls.join(';');
    let hit = cache.get(key);
    if (!hit) {
      // Only the font is read here; #556 checks the style again to draw it, and warns there.
      const t = checkStyle(decls).text;
      const weight = t['font-weight'];
      const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
      const bits = (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
      const size = fontSizePx(t['font-size'], base.size);
      hit = [
        size !== undefined && size > 0 && size < BLOCK_METRICS.maxFontSize
          ? { ...base, size }
          : base,
        bits,
      ];
      cache.set(key, hit);
    }
    return hit;
  };
  return { base, fontOf };
}

/** One measured block of {@link blockGrid}: its grid node and how it is drawn. */
export interface BlockGridItem {
  readonly id: string;
  readonly shape: BlockShape;
  readonly grid: GridNode;
}

/**
 * The grid `layoutBlock` lays out, every label measured and every leaf at its natural size,
 * before the grid runs, with the padding it runs at (items in pre-order, a space once per cell).
 * Parity hands the same tree to v12's grid.
 */
export function blockGrid(
  model: BlockModel,
  ctx: BlockLayoutContext
): { root: GridNode; items: readonly BlockGridItem[]; padding: number } {
  const { root, items, padding } = prepare(model, ctx);
  return { root, items, padding };
}

/** The measured grid and what drawing it needs. */
function prepare(model: BlockModel, ctx: BlockLayoutContext) {
  const padding = blockPadding(ctx.config, ctx.warn);
  const pads = themePads(ctx.theme, padding);
  const font = fonts(model, ctx);
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure: Measure = (text, f, style) => {
    const t = layoutLabel(text, f, Infinity, ctx.measurer, { ...inline, style });
    return { text: t, font: f, width: t.width, height: t.height };
  };
  const { root, items } = measureGrid(
    model,
    (b) => {
      const [f, bits] = font.fontOf(b);
      return measure(b.label, f, bits);
    },
    padding,
    pads
  );
  return { root, items, padding, pads, base: font.base, measure };
}

/** Lays out a block diagram in px. */
export function layoutBlock(model: BlockModel, ctx: BlockLayoutContext): BlockLayout {
  const { root, items, padding, pads, base, measure } = prepare(model, ctx);
  sizeGrid(root, padding, BLOCK_METRICS.maxSizings);
  placeGrid(root, padding);
  const blocks = items.map((item) => placedBlock(item, padding, pads));
  const edges = edgesOf(model.edges, blockIndex(blocks), (text) => measure(text, base, 0));
  return { columns: model.columns, blocks, edges, padding, bounds: boundsOf(blocks, edges) };
}

/**
 * The grid of `model` (v12's root block and its tree), every block measured as its kind
 * measures it (`kinds.ts`); a block turned into a leaf type that keeps children (a later
 * mention, as in v12) starts at its shape's size, as v12 measured it. Spaces are one cell per
 * `space:n` cell (v12's clones), measured as nothing.
 */
function measureGrid(
  model: BlockModel,
  label: (block: Block) => Measured,
  padding: number,
  pads: Pads
): { root: GridNode; items: Item[] } {
  const items: Item[] = [];
  type Parts = Pick<GridNode, 'space' | 'span' | 'band' | 'w' | 'h'> & {
    readonly columns?: number;
    readonly children: GridNode[];
  };
  const node = ({ columns, ...parts }: Parts): GridNode => ({
    ...parts,
    ...(columns !== undefined ? { columns } : {}),
    x: 0,
    y: 0,
  });
  const nothing = { w: 0, h: 0, dy: 0, band: 0 };

  // Pre-order, without recursion: each entry fills its parent's child list in source order.
  const root = node({
    space: false,
    span: 1,
    columns: model.columns,
    band: 0,
    children: [],
    w: 0,
    h: 0,
  });
  const stack: { block: Block; into: GridNode[]; parent?: number }[] = [];
  const push = (blocks: readonly Block[], into: GridNode[], parent?: number): void => {
    for (let i = blocks.length - 1; i >= 0; i--) stack.push({ block: blocks[i]!, into, parent });
  };
  push(model.blocks, root.children as GridNode[]);
  // A parent's children are pushed when it pops, so they pop before its later siblings
  // (pre-order) and fill its list in source order.
  while (stack.length > 0) {
    const { block, into, parent } = stack.pop()!;
    const { type } = block;
    if (type === 'space') {
      for (let j = 0; j < (block.cells ?? 1); j++) {
        const grid = node({ space: true, span: 1, band: 0, children: [], w: 0, h: 0 });
        into.push(grid);
        items.push({
          grid,
          block,
          id: `${block.id}-${j}`,
          shape: 'space',
          parent,
          natural: nothing,
        });
      }
      continue;
    }
    const text = isComposite(block) && block.label === '' ? undefined : label(block);
    const natural = kindOf(type).natural({
      type,
      span: block.span,
      directions: block.directions ?? [],
      ...(text ? { label: { w: text.width, h: text.height } } : {}),
      padding,
      pads,
    });
    const children: GridNode[] = [];
    const grid = node({
      space: false,
      span: block.span,
      columns: block.columns,
      band: natural.band,
      children,
      w: natural.w,
      h: natural.h,
    });
    into.push(grid);
    const index = items.length;
    items.push({
      grid,
      block,
      id: block.id,
      shape: SHAPE_OF[type],
      parent,
      ...(text ? { label: text } : {}),
      natural,
    });
    push(block.children, children, index);
  }
  return { root, items };
}

const rectAt = (cx: number, cy: number, w: number, h: number): Rect => ({
  x: cx - w / 2,
  y: cy - h / 2,
  width: w,
  height: h,
});

/** One item as placed: its cell, its outline and box, its label placed. */
function placedBlock(item: Item, padding: number, pads: Pads): BlockNodeLayout {
  const { grid, block, natural } = item;
  const cell = rectAt(grid.x, grid.y, grid.w, grid.h);
  const centre = { x: grid.x, y: grid.y };
  const common = {
    id: item.id,
    ast: block.ast,
    type: block.type,
    shape: item.shape,
    ...(item.parent !== undefined ? { parent: item.parent } : {}),
    span: grid.span,
    ...(grid.children.length > 0 && grid.columns !== undefined ? { columns: grid.columns } : {}),
    cell,
    centre,
    ...(block.colorIndex !== undefined && isComposite(block)
      ? { colorIndex: block.colorIndex }
      : {}),
  };
  if (block.type === 'space') return { ...common, box: cell };
  const { outline, label: offset } = kindOf(block.type).draw({
    type: block.type,
    span: block.span,
    directions: block.directions ?? [],
    ...(item.label ? { label: { w: item.label.width, h: item.label.height } } : {}),
    padding,
    pads,
    natural,
    cell: { w: grid.w, h: grid.h },
  });
  const [x0, y0, x1, y1] = outlineExtent(outline);
  const box = { x: grid.x + x0, y: grid.y + y0, width: x1 - x0, height: y1 - y0 };
  const label = item.label && {
    ...item.label,
    ...rectAt(grid.x + offset.x, grid.y + offset.y, item.label.width, item.label.height),
  };
  return { ...common, box, outline, ...(label ? { label } : {}) };
}

/** Each drawn block by id (the first, as edges name it): built once per layout. */
export function blockIndex(
  blocks: readonly BlockNodeLayout[]
): ReadonlyMap<string, BlockNodeLayout> {
  const byId = new Map<string, BlockNodeLayout>();
  for (const b of blocks) if (b.shape !== 'space' && !byId.has(b.id)) byId.set(b.id, b);
  return byId;
}

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

/** Where the ray from `b`'s centre towards `toward` leaves its outline. */
function clipAt(b: BlockNodeLayout, dx: number, dy: number): Point {
  return b.outline ? add(b.centre, clipOutline(b.outline, dx, dy)) : b.centre;
}

/**
 * The edges (D441): v12's straight segment between the centres, clipped at both outlines, with
 * its middle point at the centres' midpoint (where v12 put the label); between two blocks with
 * one centre, straight down from it. When an end's block holds the other, the midpoint can fall
 * outside the clipped ends; the middle point is then theirs. A self-loop is a cubic from the
 * outline back to it, standing out to the top right. Parallel edges overlap, as in v12.
 */
function edgesOf(
  edges: readonly BlockEdge[],
  byId: ReadonlyMap<string, BlockNodeLayout>,
  measure: (text: string) => Measured
): BlockEdgeLayout[] {
  const { loopAngle, loopReach } = BLOCK_METRICS;
  const angle = (loopAngle * Math.PI) / 180;
  const out: BlockEdgeLayout[] = [];
  for (const e of edges) {
    const a = byId.get(e.start);
    const b = byId.get(e.end);
    if (!a || !b) continue;
    let kind: BlockEdgeLayout['kind'];
    let points: Point[];
    let middle: Point;
    if (a === b) {
      kind = 'loop';
      const u1 = { x: Math.sin(angle), y: -Math.cos(angle) };
      const u2 = { x: Math.cos(angle), y: -Math.sin(angle) };
      const s = clipAt(a, u1.x, u1.y);
      const t = clipAt(a, u2.x, u2.y);
      const c1 = { x: s.x + loopReach * u1.x, y: s.y + loopReach * u1.y };
      const c2 = { x: t.x + loopReach * u2.x, y: t.y + loopReach * u2.y };
      points = [s, c1, c2, t];
      // The Bézier's point at one half.
      const { end, control } = CUBIC_MIDDLE;
      middle = {
        x: end * (s.x + t.x) + control * (c1.x + c2.x),
        y: end * (s.y + t.y) + control * (c1.y + c2.y),
      };
    } else {
      kind = 'line';
      let dx = b.centre.x - a.centre.x;
      let dy = b.centre.y - a.centre.y;
      const sameCentre = !(Math.hypot(dx, dy) > 0);
      if (sameCentre) {
        dx = 0;
        dy = 1;
      }
      const s = clipAt(a, dx, dy);
      const t = sameCentre ? clipAt(b, dx, dy) : clipAt(b, -dx, -dy);
      middle = { x: (a.centre.x + b.centre.x) / 2, y: (a.centre.y + b.centre.y) / 2 };
      const along = (p: Point): number => (p.x - a.centre.x) * dx + (p.y - a.centre.y) * dy;
      const [ls, lm, lt] = [along(s), along(middle), along(t)];
      if (!(Math.min(ls, lt) <= lm && lm <= Math.max(ls, lt))) {
        middle = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 };
      }
      points = [s, middle, t];
    }
    const text = e.label === '' ? undefined : measure(e.label);
    const label = text && { ...text, ...rectAt(middle.x, middle.y, text.width, text.height) };
    out.push({
      id: e.id,
      ast: e.ast,
      start: e.start,
      end: e.end,
      kind,
      points,
      arrowTypeStart: e.arrowTypeStart,
      arrowTypeEnd: e.arrowTypeEnd,
      thickness: e.thickness,
      pattern: e.pattern,
      ...(label ? { label } : {}),
    });
  }
  return out;
}

/** Every box and point drawn (D224): outlines, labels, edge points and edge labels. */
export function* drawnBoxes(
  layout: Pick<BlockLayout, 'blocks' | 'edges'>
): Generator<[string, Rect]> {
  for (const b of layout.blocks) {
    if (!b.outline) continue;
    yield [`block ${b.id}`, b.box];
    if (b.label) yield [`label of ${b.id}`, b.label];
  }
  for (const e of layout.edges) {
    for (const [i, p] of e.points.entries()) {
      yield [`edge ${e.id} point ${i}`, { x: p.x, y: p.y, width: 0, height: 0 }];
    }
    if (e.label) yield [`label of edge ${e.id}`, e.label];
  }
}

/** The union of everything drawn, and the margin around it; the margin alone when nothing is. */
function boundsOf(blocks: readonly BlockNodeLayout[], edges: readonly BlockEdgeLayout[]): Rect {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [, r] of drawnBoxes({ blocks, edges })) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  if (x0 > x1) [x0, y0, x1, y1] = [0, 0, 0, 0];
  const { margin } = BLOCK_METRICS;
  return {
    x: x0 - margin,
    y: y0 - margin,
    width: x1 - x0 + 2 * margin,
    height: y1 - y0 + 2 * margin,
  };
}
