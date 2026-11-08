/**
 * The venn custom layout (spec #429 T3, `layoutKind: 'custom'`): `VennModel` in, `VennLayout`
 * out. It follows v12's `vennRenderer.ts` with the drawing taken out, and draws from one solve
 * (D412), the one v12's visible circles came from: the pairs v12 adds for an overlap of three or
 * more (`ensurePairwiseSubsets`), the zero-size sets dropped with their overlaps (venn.js's
 * `VennDiagram`), then the ported venn.js solver (D411, D413) into `width × (height − titleH)`
 * with the padding. Every text is measured first through the injected measurer and laid out by
 * core's label layout (D414): set and overlap labels wrapped to at most three lines, text nodes
 * to their box in v12's grid. Lengths come from the `venn` config and the metrics table
 * (pitfall 13).
 *
 * Fixed on the way (D417): a negative size counts as 0, a size too large to square counts as 0
 * too, a padding that leaves no room falls back to 0, an area that is not on the chart
 * (venn.js's y −1000) gets no label and no text nodes, and a label that would lie on an earlier
 * one moves down below it.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { VENN_CONFIG_INVALID, VENN_ZERO_SET } from '../codes.ts';
import { vennLayoutConfig } from '../config.ts';
import type { VennModel, VennSubset } from '../model.ts';
import {
  areaKey,
  intersectionAreaPath,
  solveVenn,
  type Area,
  type Solved,
  type TextCentre,
} from '../solver/index.ts';
import { NORMAL_WEIGHT, VENN_METRICS, VENN_SLOTS } from './metrics.ts';
import { vennStyles } from './styles.ts';
import type {
  PlacedLabel,
  Point,
  Rect,
  VennAreaLayout,
  VennDebugShapes,
  VennLayout,
  VennTextArea,
  VennTextNodeLayout,
} from './types.ts';

/** What the layout reads from the render context. */
export type VennLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/** An area to draw: the model's entry (none for an added pair) and its laid-out size. */
interface Datum extends Area {
  readonly ast?: VennSubset['ast'];
  readonly label?: string;
}

/** The size a subset is laid out at: below 0, or too large to square, counts as 0 (D417). */
function laidOutSize(size: number): number {
  return size > 0 && Number.isFinite(size * size) ? size : 0;
}

/**
 * v12 `ensurePairwiseSubsets`: every pair of an overlap of three or more sets that has no entry
 * of its own, added once at `min(a, b) / 4` (the last `set` size of each), after the model's.
 */
function withPairs(subsets: readonly Datum[]): Datum[] {
  const existing = new Set(subsets.map((s) => areaKey(s.sets)));
  const sizes = new Map<string, number>();
  for (const s of subsets) if (s.sets.length === 1) sizes.set(s.sets[0]!, s.size);
  const added: Datum[] = [];
  for (const subset of subsets) {
    if (subset.sets.length < 3) continue;
    const members = [...subset.sets].sort();
    for (let i = 0; i < members.length - 1; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const pair = [members[i]!, members[j]!];
        const key = areaKey(pair);
        if (existing.has(key)) continue;
        existing.add(key);
        // v12 falls back to the default union size for an undeclared set; the parser rejects one.
        const a = sizes.get(pair[0]!) ?? 0;
        const b = sizes.get(pair[1]!) ?? 0;
        added.push({ sets: pair, size: Math.min(a, b) / 4 });
      }
    }
  }
  return [...subsets, ...added];
}

/** Lays out a venn diagram in px. */
export function layoutVenn(model: VennModel, ctx: VennLayoutContext): VennLayout {
  const warn = ctx.warn ?? ignoreWarning;
  const config = vennLayoutConfig(
    ctx.config.venn as Readonly<Record<string, unknown>> | undefined,
    warn
  );
  const m = VENN_METRICS;
  const { width, height } = config;
  const scale = width / m.referenceWidth;
  const family = ctx.theme.value('fontFamily');
  const font = (size: number): FontKey => ({ family, size, weight: NORMAL_WEIGHT });
  const fonts = {
    label: font(m.labelFontSize * scale),
    text: font(m.textFontSize * scale),
    title: font(m.titleFontSize),
  };
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (text: string, labelFont: FontKey, maxWidth: number): MeasuredLabel =>
    layoutLabel(text, labelFont, maxWidth, ctx.measurer, { ...inline, keepWords: true });

  // Measure first: the title.
  const titleText =
    model.title === undefined ? undefined : measure(model.title, fonts.title, Infinity);
  const titleHeight = titleText ? m.titleHeight * scale : 0;
  const chartHeight = Math.max(0, height - titleHeight);

  // The padding of the one solve (D412), unless it leaves no room.
  let padding = config.padding;
  if (padding > 0 && 2 * padding >= Math.min(width, chartHeight)) {
    warn({
      code: VENN_CONFIG_INVALID,
      message: `venn.padding ${padding} leaves no room for the circles in ${width} × ${chartHeight}; using 0.`,
    });
    padding = 0;
  }

  const drawn = drawnAreas(model, warn);
  const solved = solveVenn(drawn, { width, height: chartHeight, padding });
  const labels = placeLabels(drawn, solved, (text, maxWidth) =>
    capped(text, fonts.label, maxWidth, measure)
  );
  const areas = areasOf(drawn, solved, labels, vennStyles(model), m.circleStroke * scale);

  // Text nodes (v12 `renderTextNodes`), on the areas drawn, keyed as v12 (the last copy).
  const byKey = new Map<string, Datum>();
  for (const d of drawn) byKey.set(areaKey(d.sets), d);
  const textAreas = textAreasOf(model, byKey, solved, { scale, font: fonts.text, measure });

  const debug: VennDebugShapes | undefined = config.useDebugLayout
    ? {
        circles: textAreas.map((t) => ({ center: t.centre, radius: t.innerRadius })),
        cells: textAreas.flatMap((t) => t.nodes.map((n) => n.cell)),
        circleStroke: m.debugCircleStroke * scale,
        cellStroke: m.debugCellStroke * scale,
      }
    : undefined;

  const title = titleText && placeCentred(titleText, width / 2, m.titleBaseline * scale);
  const offset = { x: 0, y: titleHeight };
  const parts = { width, height, offset, areas, textAreas, title, debug };
  return {
    width,
    height,
    scale,
    offset,
    titleHeight,
    padding,
    areas,
    textAreas,
    ...(title ? { title } : {}),
    ...(debug ? { debug } : {}),
    fonts,
    bounds: boundsOf(parts),
  };
}

/**
 * The areas venn.js drew: the model's (sizes as D417 reads them), v12's added pairs, then every
 * zero-size set dropped with the overlaps it is in (one `VENN_ZERO_SET`), and any overlap naming
 * a set no `set` declares (a hand-built model; the parser rejects one).
 */
function drawnAreas(model: VennModel, warn: (w: Warning) => void): Datum[] {
  const data = withPairs(
    model.subsets.map((s) => ({
      sets: s.sets,
      size: laidOutSize(s.size),
      ast: s.ast,
      ...(s.label !== undefined ? { label: s.label } : {}),
    }))
  );
  const zero = new Set<string>();
  for (const d of data) if (d.sets.length === 1 && d.size === 0) zero.add(d.sets[0]!);
  const declared = new Set(data.filter((d) => d.sets.length === 1).map((d) => d.sets[0]!));
  if (zero.size > 0) {
    const ids = [...zero].map((id) => `\`${id}\``).join(', ');
    const one = zero.size === 1;
    warn({
      code: VENN_ZERO_SET,
      message: `Not drawn: ${one ? 'set' : 'sets'} ${ids} of size 0, and every overlap with ${one ? 'it' : 'them'}. Give each set a size above 0.`,
    });
  }
  return data.filter((d) => d.sets.every((id) => declared.has(id) && !zero.has(id)));
}

/**
 * Each area's label once (venn.js `VennDiagram`): the last non-empty label of its sets, else a
 * set's own id, wrapped against its first set's radius, centred on the floored text centre. One
 * that would lie on an earlier one moves down below it.
 */
function placeLabels(
  drawn: readonly Datum[],
  { circles, centres }: Solved,
  wrap: (text: string, maxWidth: number) => MeasuredLabel
): Map<string, PlacedLabel | undefined> {
  const texts = new Map<string, string>();
  for (const d of drawn) if (d.label) texts.set(areaKey(d.sets), d.label);
  const placed = new Map<string, PlacedLabel | undefined>();
  const taken: PlacedLabel[] = [];
  for (const d of drawn) {
    const key = areaKey(d.sets);
    if (placed.has(key)) continue;
    const at = visible(centres.get(key));
    const text = texts.get(key) ?? (d.sets.length === 1 ? d.sets[0] : undefined);
    if (!at || text === undefined || text === '') {
      placed.set(key, undefined);
      continue;
    }
    const wrapped = wrap(text, circles[d.sets[0]!]!.radius);
    const label = clear(placeCentred(wrapped, Math.floor(at.x), Math.floor(at.y)), taken);
    taken.push(label);
    placed.set(key, label);
  }
  return placed;
}

/** The drawn areas in v12's order, a set's with its circle and slot. */
function areasOf(
  drawn: readonly Datum[],
  { circles, centres }: Solved,
  labels: ReadonlyMap<string, PlacedLabel | undefined>,
  styles: ReadonlyMap<string, Readonly<Record<string, string>>>,
  circleStroke: number
): VennAreaLayout[] {
  let setIndex = 0;
  return drawn.map((d) => {
    const key = areaKey(d.sets);
    const members = d.sets.map((id) => circles[id]!);
    const path = intersectionAreaPath(members);
    const at = visible(centres.get(key));
    const label = labels.get(key);
    const common = {
      kind: d.sets.length === 1 ? ('set' as const) : ('overlap' as const),
      sets: d.sets,
      ...(d.ast !== undefined ? { ast: d.ast } : {}),
      size: d.size,
      ...(path ? { path } : {}),
      ...(at ? { centre: at } : {}),
      ...(label ? { label } : {}),
    };
    if (d.sets.length !== 1) return common;
    const circle = members[0]!;
    const index = setIndex++;
    return {
      ...common,
      circle: {
        center: { x: circle.x, y: circle.y },
        radius: circle.radius,
        strokeWidth: strokeOf(styles.get(key)?.['stroke-width'], circleStroke),
      },
      index,
      slot: index % VENN_SLOTS,
    };
  });
}

/** What the bounds cover. */
interface BoundsParts {
  readonly width: number;
  readonly height: number;
  readonly offset: Point;
  readonly areas: readonly VennAreaLayout[];
  readonly textAreas: readonly VennTextArea[];
  readonly title: PlacedLabel | undefined;
  readonly debug: VennDebugShapes | undefined;
}

/** The canvas grown to cover everything drawn (D224), in the diagram frame. */
function boundsOf(p: BoundsParts): Rect {
  const box = new Box();
  box.add({ x: 0, y: 0, width: p.width, height: p.height });
  if (p.title) box.add(p.title);
  const moved = (r: Rect): Rect => ({ ...r, x: r.x + p.offset.x, y: r.y + p.offset.y });
  const movedPoint = (q: Point): Point => ({ x: q.x + p.offset.x, y: q.y + p.offset.y });
  for (const area of p.areas) {
    if (area.circle) {
      const r = area.circle.radius + area.circle.strokeWidth / 2;
      box.addDisc(movedPoint(area.circle.center), r);
    }
    if (area.label) box.add(moved(area.label));
  }
  for (const t of p.textAreas) for (const n of t.nodes) box.add(moved(n.label));
  if (p.debug) {
    const { circleStroke, cellStroke } = p.debug;
    for (const c of p.debug.circles) box.addDisc(movedPoint(c.center), c.radius + circleStroke / 2);
    for (const c of p.debug.cells) box.add(moved(grow(c, cellStroke / 2)));
  }
  return box.rect();
}

/** A text centre that is on the chart. */
function visible(centre: TextCentre | undefined): Point | undefined {
  return centre && !centre.disjoint ? { x: centre.x, y: centre.y } : undefined;
}

/** A style's `stroke-width` as a number of px, else `fallback`. */
function strokeOf(value: string | undefined, fallback: number): number {
  const n = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

type Measure = (text: string, font: FontKey, maxWidth: number) => MeasuredLabel;

/**
 * `text` wrapped at `maxWidth` in at most three lines (D414, venn.js's `maxLines`): when it
 * needs more, the narrowest width past `maxWidth` that keeps it to three, found by halving.
 * Explicit breaks are kept, so a label written on more lines keeps them.
 */
function capped(text: string, font: FontKey, maxWidth: number, measure: Measure): MeasuredLabel {
  const { maxLabelLines: max, labelWidthSteps } = VENN_METRICS;
  const first = measure(text, font, maxWidth);
  if (first.lines.length <= max) return first;
  const natural = measure(text, font, Infinity);
  if (natural.lines.length >= max) return natural;
  let lo = maxWidth;
  let hi = natural.width;
  let best = natural;
  for (let step = 0; step < labelWidthSteps; step++) {
    const mid = (lo + hi) / 2;
    const at = measure(text, font, mid);
    if (at.lines.length <= max) {
      hi = mid;
      best = at;
    } else lo = mid;
  }
  return best;
}

/**
 * `label`, moved down below every label of `taken` it lies on, until it lies on none. v12 drew
 * labels where venn.js put them, on top of one another when the font (`48s`, which follows the
 * width only) is large for the circles; v13 keeps that place whenever it is free.
 */
function clear(label: PlacedLabel, taken: readonly PlacedLabel[]): PlacedLabel {
  let y = label.y;
  for (;;) {
    const on = taken.filter(
      (t) =>
        label.x < t.x + t.width &&
        t.x < label.x + label.width &&
        y < t.y + t.height &&
        t.y < y + label.height
    );
    if (on.length === 0) return { ...label, y };
    for (const t of on) y = Math.max(y, t.y + t.height);
  }
}

/** A label's box centred on `(x, y)`. */
function placeCentred(text: MeasuredLabel, x: number, y: number): PlacedLabel {
  return {
    x: x - text.width / 2,
    y: y - text.height / 2,
    width: text.width,
    height: text.height,
    text,
  };
}

/** What the text grid reads. */
interface GridParts {
  readonly scale: number;
  readonly font: FontKey;
  readonly measure: Measure;
}

/** v12 `renderTextNodes`: each area's text nodes in a grid about its text centre. */
function textAreasOf(
  model: VennModel,
  byKey: ReadonlyMap<string, Datum>,
  { circles, centres }: Solved,
  parts: GridParts
): VennTextArea[] {
  const m = VENN_METRICS;
  const { scale } = parts;
  const groups = new Map<string, VennModel['textNodes'][number][]>();
  for (const node of model.textNodes) {
    const key = areaKey(node.sets);
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  }

  const out: VennTextArea[] = [];
  for (const [key, nodes] of groups) {
    const area = byKey.get(key);
    const centre = visible(centres.get(key));
    if (!area || !centre) continue;
    const members = area.sets.map((id) => circles[id]!);
    const minCircleRadius = Math.min(...members.map((c) => c.radius));
    const innerRadiusRaw = Math.min(
      ...members.map((c) => c.radius - Math.hypot(centre.x - c.x, centre.y - c.y))
    );
    let innerRadius = Number.isFinite(innerRadiusRaw) ? Math.max(0, innerRadiusRaw) : 0;
    if (innerRadius === 0 && Number.isFinite(minCircleRadius)) {
      innerRadius = minCircleRadius * m.innerRadiusFallback;
    }

    const innerWidth = Math.max(m.textBoxMinWidth * scale, innerRadius * m.textBoxFactor);
    const innerHeight = Math.max(m.textBoxMinHeight * scale, innerRadius * m.textBoxFactor);
    const hasLabel = area.label !== undefined && area.label.length > 0;
    const labelOffsetBase = hasLabel
      ? Math.min(m.labelOffsetMax * scale, innerRadius * m.labelOffsetFactor)
      : 0;
    const labelOffset =
      labelOffsetBase + (nodes.length <= m.fewNodes ? m.fewNodesOffset * scale : 0);
    const startX = centre.x - innerWidth / 2;
    const startY = centre.y - innerHeight / 2 + labelOffset;
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const rows = Math.max(1, Math.ceil(nodes.length / cols));
    const cellWidth = innerWidth / cols;
    const cellHeight = innerHeight / rows;

    const placed: VennTextNodeLayout[] = nodes.map((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + cellWidth * (col + 1 / 2);
      const y = startY + cellHeight * (row + 1 / 2);
      const boxWidth = cellWidth * m.cellFactor;
      const boxHeight = cellHeight * m.cellFactor;
      const text = parts.measure(node.label ?? node.id, parts.font, boxWidth);
      return {
        ast: node.ast,
        id: node.id,
        cell: {
          x: startX + cellWidth * col,
          y: startY + cellHeight * row,
          width: cellWidth,
          height: cellHeight,
        },
        box: { x: x - boxWidth / 2, y: y - boxHeight / 2, width: boxWidth, height: boxHeight },
        label: placeCentred(text, x, y),
      };
    });
    out.push({
      sets: area.sets,
      centre,
      innerRadius,
      grid: { x: startX, y: startY, width: innerWidth, height: innerHeight },
      nodes: placed,
    });
  }
  return out;
}

/** `r` grown by `d` on every side. */
function grow(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d };
}

/** The union of what is drawn. */
class Box {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add(r: Rect): void {
    this.x0 = Math.min(this.x0, r.x);
    this.y0 = Math.min(this.y0, r.y);
    this.x1 = Math.max(this.x1, r.x + r.width);
    this.y1 = Math.max(this.y1, r.y + r.height);
  }
  /** The square around the disc of radius `r` about `center`. */
  addDisc(center: Point, r: number): void {
    this.add({ x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r });
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}
