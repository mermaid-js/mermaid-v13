/**
 * The sankey custom layout (spec #427 T3, `layoutKind: 'custom'`): `SankeyModel` in,
 * `SankeyLayout` out. It follows v12's `sankeyRenderer.ts` with the drawing taken out: the
 * labels are measured first through the injected measurer at 14 px in `fontFamily`
 * (pitfall 16), the boxes come from d3-sankey 0.12.3 as v12 configures it (`./d3-sankey.ts`),
 * then each node gets its fill and label and each link its path (d3-sankey's
 * `sankeyLinkHorizontal`, d3-shape 1.3.7's `linkHorizontal`: BSD 3-Clause License, see
 * THIRD_PARTY_NOTICES), where v12 put them. The bounds cover what is drawn with no padding, as
 * v12's `setupGraphViewbox(…, 0)` took the drawn box (D224): the nodes, the labels with the
 * outlined style's halo, and the link strokes. Lengths come from the `sankey` config and the
 * metrics table (pitfall 13).
 */
import type { RenderContext } from '@mermaid-js/core';
import type { FontKey } from '@mermaid-js/core/text';
import { sankeyLayoutConfig, type SankeyLayoutConfig } from '../config.ts';
import type { SankeyModel } from '../model.ts';
import { d3Sankey, type D3LinkInput, type D3Node } from './d3-sankey.ts';
import { D3_SANKEY, NORMAL_WEIGHT, SANKEY_METRICS, TABLEAU10 } from './metrics.ts';
import type {
  Rect,
  SankeyLabel,
  SankeyLayout,
  SankeyLinkLayout,
  SankeyNodeLayout,
} from './types.ts';

/** What the layout reads from the render context. */
export type SankeyLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'>;

const ROUND = 100;

/** v12's `getText` (`:174-179`), on one line (D395). */
function labelText(id: string, value: number, config: SankeyLayoutConfig): string {
  if (!config.showValues) return id;
  return `${id} ${config.prefix}${Math.round(value * ROUND) / ROUND}${config.suffix}`;
}

/** The layer of the first node with the strictly largest value, else 0 (`:44-57`). */
function centralLayer(nodes: readonly D3Node[]): number {
  let top = 0;
  let layer = 0;
  for (const node of nodes)
    if (node.value > top) {
      top = node.value;
      layer = node.layer;
    }
  return layer;
}

/** The smallest box holding every one of `boxes`; all 0 when there is none. */
function union(boxes: readonly Rect[]): Rect {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const b of boxes) {
    left = Math.min(left, b.x);
    top = Math.min(top, b.y);
    right = Math.max(right, b.x + b.width);
    bottom = Math.max(bottom, b.y + b.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Lays out a sankey diagram in px. */
export function layoutSankey(model: SankeyModel, ctx: SankeyLayoutContext): SankeyLayout {
  const config = sankeyLayoutConfig(ctx.config.sankey);
  const m = SANKEY_METRICS;
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: m.fontSize,
    weight: NORMAL_WEIGHT,
  };

  const indexOf = new Map(model.nodes.map((n, i) => [n.id, i]));
  const links: D3LinkInput[] = model.links.map((l) => ({
    source: indexOf.get(l.source)!,
    target: indexOf.get(l.target)!,
    flow: l.flow,
  }));
  const padding = config.nodePadding + (config.showValues ? m.valuePadding : 0);
  const graph = d3Sankey(model.nodes.length, links, {
    nodeWidth: config.nodeWidth,
    nodePadding: padding,
    align: config.nodeAlignment,
    x0: 0,
    y0: 0,
    x1: config.width,
    y1: config.height,
    ...D3_SANKEY,
  });

  // Measure every label first (pitfall 16): positions do not depend on it, the bounds do.
  const texts = graph.nodes.map((node, i) =>
    labelText(model.nodes[i]!.id, node.value / graph.scale, config)
  );
  const widths = texts.map((t) => ctx.measurer.width(t, font, 0));
  const { ascent, descent } = ctx.measurer.metrics(font);

  const central = centralLayer(graph.nodes);
  const dy = config.showValues ? 0 : m.labelShiftEm * m.fontSize;
  let slots = 0;
  const nodes: SankeyNodeLayout[] = graph.nodes.map((node, i) => {
    const source = model.nodes[i]!;
    // v12's `nodeColors[id] ?? scale(id)`: a named node asks the scale for no slot.
    const named = config.nodeColors.has(source.id);
    const slot = named ? undefined : slots++ % TABLEAU10.length;
    // v12's getLabelPosition (`:189-203`).
    const left =
      config.labelStyle === 'outlined' ? node.layer < central : !(node.x0 < config.width / 2);
    const x = left ? node.x0 - m.labelGap : node.x1 + m.labelGap;
    const y = (node.y1 + node.y0) / 2;
    const width = widths[i]!;
    const label: SankeyLabel = {
      text: texts[i]!,
      x,
      y,
      dy,
      anchor: left ? 'end' : 'start',
      box: { x: left ? x - width : x, y: y + dy - ascent, width, height: ascent + descent },
    };
    return {
      index: i,
      id: source.id,
      ast: source.ast,
      x0: node.x0,
      x1: node.x1,
      y0: node.y0,
      y1: node.y1,
      value: node.value / graph.scale,
      layer: node.layer,
      ...(slot === undefined ? {} : { slot }),
      fill: slot === undefined ? String(config.nodeColors.get(source.id)) : TABLEAU10[slot]!,
      label,
    };
  });

  const out: SankeyLinkLayout[] = graph.links.map((link, i) => {
    const l = links[i]!;
    const x0 = link.source.x1;
    const x1 = link.target.x0;
    const mx = (x0 + x1) / 2;
    return {
      index: i,
      ast: model.links[i]!.ast,
      source: l.source,
      target: l.target,
      flow: l.flow,
      width: link.width,
      strokeWidth: Math.max(m.minLinkWidth, link.width),
      y0: link.y0,
      y1: link.y1,
      path: {
        from: { x: x0, y: link.y0 },
        c1: { x: mx, y: link.y0 },
        c2: { x: mx, y: link.y1 },
        to: { x: x1, y: link.y1 },
      },
      sourceFill: nodes[l.source]!.fill,
      targetFill: nodes[l.target]!.fill,
    };
  });

  // What is drawn: nodes, labels (with the outline's halo), and link strokes. A link's stroke
  // is horizontal at both ends and its centre line runs monotonically from y0 to y1, so it
  // spans x0…x1 and reaches half its width past the higher and the lower end.
  const halo = config.labelStyle === 'outlined' ? m.outlineWidth / 2 : 0;
  const boxes: Rect[] = [];
  for (const n of nodes) {
    boxes.push({ x: n.x0, y: n.y0, width: n.x1 - n.x0, height: n.y1 - n.y0 });
    const b = n.label.box;
    boxes.push({
      x: b.x - halo,
      y: b.y - halo,
      width: b.width + 2 * halo,
      height: b.height + 2 * halo,
    });
  }
  for (const l of out) {
    const { from, to } = l.path;
    const half = l.strokeWidth / 2;
    const top = Math.min(from.y, to.y) - half;
    boxes.push({
      x: Math.min(from.x, to.x),
      y: top,
      width: Math.abs(to.x - from.x),
      height: Math.max(from.y, to.y) + half - top,
    });
  }
  return {
    width: config.width,
    height: config.height,
    padding: graph.padding,
    nodes,
    links: out,
    labelStyle: config.labelStyle,
    font,
    bounds: union(boxes),
  };
}
