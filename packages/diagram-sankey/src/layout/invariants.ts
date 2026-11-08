/**
 * The sankey layout's invariants (spec #427 §Testing, R-LAYOUT-3): what every `SankeyLayout`
 * must satisfy for the model it was laid out from and the `sankey` config section it was laid
 * out with. Empty when the layout is sound; each entry names a broken rule. Exported from
 * `@mermaid-js/diagram-sankey/testing` for the conformance corpus spec.
 */
import { sankeyLayoutConfig, type SankeyLayoutConfig } from '../config.ts';
import type { SankeyModel } from '../model.ts';
import { SANKEY_METRICS, TABLEAU10 } from './metrics.ts';
import type { Rect, SankeyLayout, SankeyNodeLayout } from './types.ts';

/**
 * Float tolerance of the checks, relative to the extent: d3-sankey leaves overlaps of up to
 * 1e-6 px unresolved (its collision threshold).
 */
const EPS = 1e-6;

/** What every check reads. */
interface Check {
  readonly model: SankeyModel;
  readonly layout: SankeyLayout;
  readonly config: SankeyLayoutConfig;
  readonly tol: number;
  readonly out: string[];
}

export function sankeyLayoutViolations(
  model: SankeyModel,
  layout: SankeyLayout,
  section: Readonly<Record<string, unknown>> = {}
): string[] {
  const config = sankeyLayoutConfig(section);
  const c: Check = {
    model,
    layout,
    config,
    tol: 2 * EPS * Math.max(1, config.width, config.height),
    out: [],
  };
  // Geometry is finite; a node's value may be Infinity (sums that overflow), never NaN.
  finite(layout, 'layout', c.out);
  order(c);
  columns(c);
  proportions(c);
  linkEnds(c);
  colours(c);
  labels(c);
  bounds(c);
  return c.out;
}

/** Nodes and links in model order. */
function order({ model, layout, out }: Check): void {
  if (layout.nodes.length !== model.nodes.length)
    out.push(`${layout.nodes.length} nodes for ${model.nodes.length} model nodes`);
  if (layout.links.length !== model.links.length)
    out.push(`${layout.links.length} links for ${model.links.length} model links`);
  layout.nodes.forEach((n, i) => {
    if (n.index !== i || n.id !== model.nodes[i]?.id) out.push(`node ${i} is ${n.id}`);
  });
  layout.links.forEach((l, i) => {
    const m = model.links[i];
    const s = layout.nodes[l.source];
    const t = layout.nodes[l.target];
    if (!m || s?.id !== m.source || t?.id !== m.target || l.ast !== m.ast || l.index !== i)
      out.push(`link ${i} is not the model's`);
  });
}

/**
 * The padding (nodePadding, + valuePadding under showValues, less when the tallest column would
 * not fit); nodes inside the extent and nodeWidth wide; one x per layer, layers left to right;
 * nodes in one layer apart by the padding.
 */
function columns({ layout, config, tol, out }: Check): void {
  const byLayer = new Map<number, SankeyNodeLayout[]>();
  for (const n of layout.nodes) byLayer.set(n.layer, [...(byLayer.get(n.layer) ?? []), n]);
  const tallest = Math.max(0, ...[...byLayer.values()].map((c) => c.length));
  const asked = config.nodePadding + (config.showValues ? SANKEY_METRICS.valuePadding : 0);
  const padding = tallest > 1 ? Math.min(asked, config.height / (tallest - 1)) : asked;
  if (Math.abs(layout.padding - padding) > tol)
    out.push(`padding ${layout.padding}, not ${padding}`);
  for (const n of layout.nodes) {
    if (n.x0 < -tol || n.x1 > config.width + tol || n.y0 < -tol || n.y1 > config.height + tol)
      out.push(`node ${n.id} is outside the extent`);
    if (Math.abs(n.x1 - n.x0 - config.nodeWidth) > tol)
      out.push(`node ${n.id} is ${n.x1 - n.x0} wide`);
    if (n.y1 < n.y0 - tol) out.push(`node ${n.id} has a negative height`);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  layers.forEach((layer, k) => {
    const column = byLayer.get(layer)!;
    const x = column[0]!.x0;
    if (column.some((n) => n.x0 !== x)) out.push(`layer ${layer} is not one column`);
    const prev = byLayer.get(layers[k - 1] ?? NaN);
    if (prev && !(prev[0]!.x0 <= x)) out.push(`layer ${layer} is left of the one before`);
    const sorted = [...column].sort((a, b) => a.y0 - b.y0);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      if (b.y0 - a.y1 < layout.padding - tol)
        out.push(`nodes ${a.id} and ${b.id} are ${b.y0 - a.y1} apart in layer ${layer}`);
    }
  });
}

/**
 * A node's height is proportional to its value, a link's width to its flow, and the widths at
 * a node sum to its height (the larger side does): values worked here from the flows, divided
 * by the largest so that no sum overflows.
 */
function proportions({ model, layout, tol, out }: Check): void {
  const { nodes, links } = layout;
  const top = Math.max(0, ...model.links.map((l) => l.flow));
  const unit = (flow: number): number => (top > 0 ? flow / top : 0);
  const ins = nodes.map(() => 0);
  const outs = nodes.map(() => 0);
  const widthIn = nodes.map(() => 0);
  const widthOut = nodes.map(() => 0);
  links.forEach((l, i) => {
    const flow = unit(model.links[i]?.flow ?? 0);
    outs[l.source]! += flow;
    ins[l.target]! += flow;
    widthOut[l.source]! += l.width;
    widthIn[l.target]! += l.width;
  });
  const values = nodes.map((_, i) => Math.max(ins[i]!, outs[i]!));
  const ref = values.indexOf(Math.max(0, ...values));
  const n0 = nodes[ref];
  const k = n0 && values[ref]! > 0 ? (n0.y1 - n0.y0) / values[ref]! : 0;
  nodes.forEach((n, i) => {
    const h = n.y1 - n.y0;
    if (Math.abs(h - values[i]! * k) > tol)
      out.push(`node ${n.id} is ${h} high, not ${values[i]! * k}`);
    const v = values[i]! * top;
    if (Number.isFinite(v) && Math.abs(n.value - v) > EPS * Math.max(1, v))
      out.push(`node ${n.id} has value ${n.value}, not ${v}`);
    const sides = Math.max(widthIn[i]!, widthOut[i]!);
    if (Math.abs(sides - h) > tol) out.push(`the links at ${n.id} are ${sides} wide, not ${h}`);
  });
  links.forEach((l, i) => {
    if (Math.abs(l.width - unit(model.links[i]?.flow ?? 0) * k) > tol)
      out.push(`link ${i} is ${l.width} wide`);
    if (l.strokeWidth !== Math.max(SANKEY_METRICS.minLinkWidth, l.width))
      out.push(`link ${i} is stroked ${l.strokeWidth} wide`);
  });
}

/** Each link from its source's right edge to its target's left, each band inside its node. */
function linkEnds({ layout, tol, out }: Check): void {
  layout.links.forEach((l, i) => {
    const s = layout.nodes[l.source];
    const t = layout.nodes[l.target];
    if (!s || !t) return;
    const { from, c1, c2, to } = l.path;
    if (from.x !== s.x1 || from.y !== l.y0)
      out.push(`link ${i} does not start on ${s.id}'s right edge`);
    if (to.x !== t.x0 || to.y !== l.y1) out.push(`link ${i} does not end on ${t.id}'s left edge`);
    if (c1.y !== l.y0 || c2.y !== l.y1 || c1.x !== c2.x || c1.x !== (from.x + to.x) / 2)
      out.push(`link ${i}'s curve is not d3's horizontal link`);
    if (l.y0 - l.width / 2 < s.y0 - tol || l.y0 + l.width / 2 > s.y1 + tol)
      out.push(`link ${i} leaves ${s.id} outside its box`);
    if (l.y1 - l.width / 2 < t.y0 - tol || l.y1 + l.width / 2 > t.y1 + tol)
      out.push(`link ${i} reaches ${t.id} outside its box`);
    if (l.sourceColour !== s.colour || l.targetColour !== t.colour)
      out.push(`link ${i} is not coloured by its ends`);
  });
}

/** nodeColors, else the next Tableau10 slot. */
function colours({ layout, config, out }: Check): void {
  let slot = 0;
  for (const n of layout.nodes) {
    const own = config.nodeColors.get(n.id);
    const want = own === undefined ? slot++ % TABLEAU10.length : undefined;
    if (n.slot !== want || n.colour !== (own ?? TABLEAU10[want!]))
      out.push(`node ${n.id} is coloured ${n.colour} (slot ${n.slot})`);
  }
}

/** Labels at the node's centre, labelGap past the side their anchor names. */
function labels({ layout, config, tol, out }: Check): void {
  const gap = SANKEY_METRICS.labelGap;
  for (const n of layout.nodes) {
    const { label } = n;
    const x = label.anchor === 'start' ? n.x1 + gap : n.x0 - gap;
    if (label.x !== x || label.y !== (n.y0 + n.y1) / 2) out.push(`node ${n.id}'s label is off`);
    const left = label.anchor === 'start' ? label.x : label.x - label.box.width;
    if (Math.abs(label.box.x - left) > tol) out.push(`node ${n.id}'s label box is off its anchor`);
    if (label.dy !== (config.showValues ? 0 : SANKEY_METRICS.labelShift))
      out.push(`node ${n.id}'s label has dy ${label.dy}`);
  }
}

/** Everything drawn inside the bounds (D224). */
function bounds({ layout, tol, out }: Check): void {
  const b = layout.bounds;
  const inside = (r: Rect, what: string): void => {
    if (
      r.x < b.x - tol ||
      r.y < b.y - tol ||
      r.x + r.width > b.x + b.width + tol ||
      r.y + r.height > b.y + b.height + tol
    )
      out.push(`${what} is outside the bounds`);
  };
  for (const n of layout.nodes) {
    inside({ x: n.x0, y: n.y0, width: n.x1 - n.x0, height: n.y1 - n.y0 }, `node ${n.id}`);
    inside(n.label.box, `node ${n.id}'s label`);
  }
  for (const l of layout.links)
    for (const p of [l.path.from, l.path.c1, l.path.c2, l.path.to])
      inside({ ...p, width: 0, height: 0 }, `link ${l.index}`);
}

/** Every number in `v`, at any depth, is finite (a node's `value` only not NaN). */
function finite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    const ok = path.endsWith('.value') ? !Number.isNaN(v) : Number.isFinite(v);
    if (!ok) out.push(`${path} is ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === 'object')
    for (const [key, x] of Object.entries(v)) finite(x, `${path}.${key}`, out);
}
