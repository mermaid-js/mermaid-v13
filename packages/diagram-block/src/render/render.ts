/**
 * Draws a laid-out block diagram through the SvgWriter (spec #521 T4, DESIGN §7, D215, D227).
 * The layout (`layoutBlock`) measured and placed everything; this file only paints it, with
 * v12's structure and class names (`blockRenderer.ts`, `renderHelpers.ts`):
 *
 * - the root, then `g.block` holding every block in pre-order (a composite before its children,
 *   as v12 inserted them), each a `g.node` translated to its centre with `data-id`, `data-ast`
 *   and v12's classes (`node <classes or default> flowchart-label`): its shape (`label-container`;
 *   a composite's is `rect.basic.cluster.composite.label-container` and its `g.node` carries
 *   the palette slot's `data-color-id`, or without a palette the rect is filled `clusterBkg`
 *   at 0.5 and stroked `clusterBorder` at 0.2 (#771); a block arrow's
 *   `polygon.label-container.block-arrow`),
 *   then its label in a `g.label`. Spaces draw nothing;
 * - after every block, each edge as a `path.flowchart-link` (`edge-thickness-*`,
 *   `edge-pattern-*`) with `data-id` and `data-ast`, its arrowheads inline after it;
 * - then each edge label, a `g.edgeLabel` with its `edgeLabelBackground` box and its text.
 *
 * No `<style>` (but `theme: 'auto'`'s), `<marker>`, `<filter>` or `foreignObject`; no element
 * id but D182's gradient, which core's writer adds (block has no accessible title, as in v12).
 * `data-ast` marks one element per drawn AST node (pitfall 12): each block's `g.node` and each
 * edge's `path`; labels carry `data-id` only.
 */
import { translate, type Attrs, type CheckedStyle, type SvgWriter } from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
import type { BlockLayout, BlockNodeLayout, PlacedLabel } from '../layout/types.ts';
import { isComposite, type Block, type BlockModel } from '../model.ts';
import { drawShape } from '../shapes/draw.ts';
import type { BlockRenderContext } from './context.ts';
import { drawEdge, drawEdgeLabel } from './edges.ts';
import { paints, type Paints, type Tint } from './paint.ts';

/** What every section of one render draws from. */
export interface Scene {
  readonly w: SvgWriter;
  readonly ctx: BlockRenderContext;
  readonly layout: BlockLayout;
  readonly paint: Paints;
}

/** Writes the whole `<svg>` document for a laid-out block diagram. */
export function renderBlock(
  model: BlockModel,
  layout: BlockLayout,
  ctx: BlockRenderContext,
  w: SvgWriter
): void {
  // Every theme variable is read before the root, so its style declares them.
  const scene: Scene = { w, ctx, layout, paint: paints(ctx.theme, model, ctx.warn) };
  const byId = modelBlocks(model);
  openRoot(scene);
  w.open('g', { class: 'block' });
  for (const b of layout.blocks) {
    const block = byId.get(b.id);
    if (block) drawNode(scene, b, block);
  }
  for (const e of layout.edges) drawEdge(scene, e);
  for (const e of layout.edges) if (e.label) drawEdgeLabel(scene, e, e.label);
  w.close();
  w.close();
}

/** Every model block by id, without recursion (composites nest thousands deep). */
function modelBlocks(model: BlockModel): ReadonlyMap<string, Block> {
  const out = new Map<string, Block>();
  const stack: Block[] = [...model.blocks];
  while (stack.length > 0) {
    const b = stack.pop()!;
    if (!out.has(b.id)) out.set(b.id, b);
    for (const c of b.children) stack.push(c);
  }
  return out;
}

/** The `<svg>` root: the layout's bounds as the viewBox (D224), the theme's aliases. */
function openRoot({ w, ctx, layout, paint }: Scene): void {
  const { config } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = (config as { block?: { useMaxWidth?: unknown } }).block?.useMaxWidth !== false;
  openSvgRoot(w, ctx, {
    name: 'block',
    viewBox: [x, y, width, height],
    maxWidth,
    attrs: {
      'font-family': paint.font,
      'font-size': paint.fontSize,
    },
  });
}

/** v12's class names on a block's group: its classes, else `default`, then `flowchart-label`. */
function nodeClass(block: Block): string {
  let out = 'node';
  let any = false;
  for (const entry of block.classes)
    for (const name of entry.split(/\s+/)) {
      const c = name.replace(/[^\w-]/g, '');
      if (c) {
        out += ' ' + c;
        any = true;
      }
    }
  return out + (any ? '' : ' default') + ' flowchart-label';
}

/**
 * A block's outline paint: a composite's palette slot, else (without one) the cluster paint
 * (#771), else the leaves'. The author's `style` and `classDef` win over all of them (spread
 * after); an author's fill or stroke is opaque, as v12's inline style replaced the faded colour.
 */
function outlinePaint(
  paint: Paints,
  style: CheckedStyle,
  slot: Tint | undefined,
  composite: boolean
): Attrs {
  const frame = composite && !slot ? paint.composite : undefined;
  return {
    fill: slot?.fill ?? frame?.fill ?? paint.node.fill,
    'fill-opacity': style.shape.fill === undefined ? frame?.fillOpacity : undefined,
    stroke: slot?.stroke ?? frame?.stroke ?? paint.node.stroke,
    'stroke-opacity': style.shape.stroke === undefined ? frame?.strokeOpacity : undefined,
    'stroke-width': paint.node.strokeWidth,
    filter: paint.node.shadow,
    ...style.shape,
  };
}

/** One block: its `g.node`, its shape, then its label. A space draws nothing. */
function drawNode({ w, ctx, paint }: Scene, b: BlockNodeLayout, block: Block): void {
  const { shape, outline } = b;
  if (shape === 'space' || !outline) return;
  const style = paint.styleOf(block);
  const composite = isComposite(block);
  const slot = composite ? paint.slotOf(b.colorIndex) : undefined;
  w.open('g', {
    class: nodeClass(block),
    'data-id': b.id,
    'data-ast': b.ast,
    'data-color-id': slot?.id,
    transform: translate(b.centre.x, b.centre.y),
  });
  const outlineAttrs = outlinePaint(paint, style, slot, composite);
  drawShape(w, shape, outline, {
    outline: outlineAttrs,
    line: { stroke: outlineAttrs.stroke, 'stroke-width': outlineAttrs['stroke-width'] },
    ringGap: paint.node.ringGap,
  });
  if (b.label) {
    // A filled shape's text takes the ink of its fill; the author's text style wins.
    const fill = style.shape.fill;
    drawLabel(w, b.label, b, {
      fill: (fill && ctx.theme.ink(fill)) || paint.node.text,
      ...style.text,
    });
  }
  w.close();
}

/** A block's label in a `g.label` (`data-id` only), centred in its box, in the block's frame. */
function drawLabel(w: SvgWriter, label: PlacedLabel, b: BlockNodeLayout, attrs: Attrs): void {
  w.open('g', { class: 'label', 'data-id': b.id });
  w.label(
    label.text,
    label.x + label.width / 2 - b.centre.x,
    label.y + label.height / 2 - b.centre.y,
    attrs
  );
  w.close();
}
