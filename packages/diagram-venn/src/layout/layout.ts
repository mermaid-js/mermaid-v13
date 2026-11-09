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
 * Fixed on the way (D417): sizes as `../sizes.ts` reads them (a negative or too large size counts
 * as 0), a padding that leaves no room counts as 0, an area that is not on the chart (venn.js's
 * y −1000) gets no label and no text nodes, and a label that would lie on an earlier one moves
 * down below it.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { VENN_ZERO_SET } from '../codes.ts';
import { vennLayoutConfig } from '../config.ts';
import { idsKey, pairwiseRule, setIdOf, type VennModel, type VennSubset } from '../model.ts';
import { idText, listOf } from '../parser/text.ts';
import { laidOutSize } from '../sizes.ts';
import {
  intersectionAreaPath,
  solveVenn,
  type Area,
  type Solved,
  type TextCentre,
} from '../solver/index.ts';
import { slotOf } from '../theme/slots.ts';
import { boxUnion, drawnBoxes, overlaps } from './geometry.ts';
import { NORMAL_WEIGHT, VENN_METRICS } from './metrics.ts';
import { vennStyles } from './styles.ts';
import type {
  PlacedLabel,
  Point,
  VennAreaLayout,
  VennDebugShapes,
  VennLayout,
  VennStyleProperties,
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

/**
 * `subsets` and, after them, the pairs v12 adds (`ensurePairwiseSubsets`, `pairwiseRule`), each
 * at `min(a, b) / 4` (the last `set` size of each).
 */
function withPairs(subsets: readonly Datum[]): Datum[] {
  const sizes = new Map<string, number>();
  for (const s of subsets) {
    const id = setIdOf(s);
    if (id !== undefined) sizes.set(id, s.size);
  }
  // v12 falls back to the default union size for an undeclared set; the parser rejects one.
  const added = pairwiseRule(subsets)
    .added()
    .map(
      (pair): Datum => ({
        sets: pair,
        size: Math.min(sizes.get(pair[0]) ?? 0, sizes.get(pair[1]) ?? 0) / 4,
      })
    );
  return [...subsets, ...added];
}

/** Lays out a venn diagram in px. */
export function layoutVenn(model: VennModel, ctx: VennLayoutContext): VennLayout {
  const config = vennLayoutConfig(ctx.config.venn as Readonly<Record<string, unknown>> | undefined);
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
  // The padding of the one solve (D412); one that leaves no room counts as 0.
  const padding = 2 * config.padding < Math.min(width, chartHeight) ? config.padding : 0;

  const drawn = drawnAreas(model, ctx.warn ?? ignoreWarning);
  const solved = solveVenn(drawn, { width, height: chartHeight, padding });
  const labels = placeLabels(drawn, solved, (text, maxWidth) =>
    capped(text, fonts.label, maxWidth, measure)
  );
  const styles = vennStyles(model);
  const areas = areasOf({
    drawn,
    solved,
    labels,
    styles,
    circleStroke: m.circleStroke * scale,
  });

  // Text nodes (v12 `renderTextNodes`), on the areas drawn, keyed as v12 (the last copy).
  const byKey = new Map<string, Datum>();
  for (const d of drawn) byKey.set(idsKey(d.sets), d);
  const textAreas = textAreasOf(model, byKey, solved, {
    scale,
    font: fonts.text,
    measure,
    styles,
  });

  const debug: VennDebugShapes | undefined = config.useDebugLayout
    ? {
        circles: textAreas.map((t) => t.inner),
        cells: textAreas.flatMap((t) => t.nodes.map((n) => n.cell)),
        circleStroke: m.debugCircleStroke * scale,
        cellStroke: m.debugCellStroke * scale,
      }
    : undefined;

  const title = titleText && placeCentred(titleText, width / 2, m.titleBaseline * scale);
  const offset = { x: 0, y: titleHeight };
  const drawing = {
    width,
    height,
    offset,
    areas,
    textAreas,
    ...(title ? { title } : {}),
    ...(debug ? { debug } : {}),
  };
  return {
    ...drawing,
    scale,
    titleHeight,
    padding,
    fonts,
    bounds: boxUnion([...drawnBoxes(drawing)].map(([, box]) => box)),
  };
}

/**
 * The areas venn.js drew: the model's (sizes as D417 reads them), v12's added pairs, then every
 * set laid out at 0 dropped with the overlaps it is in, and any overlap naming a set no `set`
 * declares (a hand-built model; the parser rejects one). Sets written with size 0 get one
 * `VENN_ZERO_SET`; a negative or too large size is the parser's `VENN_INVALID_SIZE`.
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
  const dropped = new Set<string>();
  const declared = new Set<string>();
  for (const d of data) {
    const id = setIdOf(d);
    if (id === undefined) continue;
    declared.add(id);
    if (d.size === 0) dropped.add(id);
  }
  const zero = new Set<string>();
  for (const s of model.subsets) {
    const id = setIdOf(s);
    if (id !== undefined && s.size === 0) zero.add(id);
  }
  if (zero.size > 0) {
    const ids = listOf([...zero].map((id) => `\`${idText(id)}\``));
    const one = zero.size === 1;
    warn({
      code: VENN_ZERO_SET,
      message: `Not drawn: ${one ? 'set' : 'sets'} ${ids} of size 0, and every overlap with ${one ? 'it' : 'them'}. Give each set a size above 0.`,
    });
  }
  return data.filter((d) => d.sets.every((id) => declared.has(id) && !dropped.has(id)));
}

/**
 * Each area's label once (venn.js `VennDiagram`): the last non-empty label of its sets, else a
 * set's own id, wrapped against its first set's radius (venn.js's `wrapText` width), centred on
 * the floored text centre. One that would lie on an earlier one moves down below it.
 */
function placeLabels(
  drawn: readonly Datum[],
  { circles, centres }: Solved,
  wrap: (text: string, maxWidth: number) => MeasuredLabel
): Map<string, PlacedLabel | undefined> {
  const texts = new Map<string, string>();
  for (const d of drawn) if (d.label) texts.set(idsKey(d.sets), d.label);
  const placed = new Map<string, PlacedLabel | undefined>();
  const taken: PlacedLabel[] = [];
  for (const d of drawn) {
    const key = idsKey(d.sets);
    if (placed.has(key)) continue;
    const at = visible(centres.get(key));
    const text = texts.get(key) ?? setIdOf(d);
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

/** What {@link areasOf} builds the drawn areas from. */
interface AreaParts {
  readonly drawn: readonly Datum[];
  readonly solved: Solved;
  readonly labels: ReadonlyMap<string, PlacedLabel | undefined>;
  readonly styles: ReadonlyMap<string, VennStyleProperties>;
  /** `5s`, for a set no style gives a `stroke-width`. */
  readonly circleStroke: number;
}

/** The drawn areas in v12's order, a set's with its circle and slot. */
function areasOf({ drawn, solved, labels, styles, circleStroke }: AreaParts): VennAreaLayout[] {
  const { circles, centres } = solved;
  let setIndex = 0;
  return drawn.map((d): VennAreaLayout => {
    const key = idsKey(d.sets);
    const members = d.sets.map((id) => circles[id]!);
    const path = intersectionAreaPath(members);
    const at = visible(centres.get(key));
    const label = labels.get(key);
    const style = styles.get(key);
    const common = {
      sets: d.sets,
      ...(d.ast !== undefined ? { ast: d.ast } : {}),
      size: d.size,
      ...(path ? { path } : {}),
      ...(at ? { centre: at } : {}),
      ...(label ? { label } : {}),
      ...(style ? { style } : {}),
    };
    if (setIdOf(d) === undefined) return { kind: 'overlap', ...common };
    const { x, y, radius } = members[0]!;
    const index = setIndex++;
    return {
      kind: 'set',
      ...common,
      circle: { x, y, radius, strokeWidth: strokeOf(style?.['stroke-width'], circleStroke) },
      index,
      slot: slotOf(index),
    };
  });
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

/** A line break as core's label layout reads one. */
const RE_BREAK = /\\n|\r\n?|\n|<br\s*\/?>/gi;

/**
 * `text` in at most three lines (D414). v12 drew every line venn.js's `wrapText` made, so no
 * text is dropped: lines written past the second are joined into the third with a blank; then
 * the label wraps at `maxWidth`, and when that needs more than three lines, at the narrowest
 * wider width that keeps it to three, found by halving.
 */
function capped(text: string, font: FontKey, maxWidth: number, measure: Measure): MeasuredLabel {
  const { maxLabelLines: max, labelWidthSteps } = VENN_METRICS;
  const parts = text.split(RE_BREAK);
  const source =
    parts.length > max
      ? [...parts.slice(0, max - 1), parts.slice(max - 1).join(' ')].join('<br>')
      : text;
  const first = measure(source, font, maxWidth);
  if (first.lines.length <= max) return first;
  const natural = measure(source, font, Infinity);
  if (natural.lines.length >= max) return natural;
  let lo = maxWidth;
  let hi = natural.width;
  let best = natural;
  for (let step = 0; step < labelWidthSteps; step++) {
    const mid = (lo + hi) / 2;
    const at = measure(source, font, mid);
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
  let at = label;
  for (;;) {
    const on = taken.filter((t) => overlaps(at, t));
    if (on.length === 0) return at;
    at = { ...at, y: Math.max(at.y, ...on.map((t) => t.y + t.height)) };
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
  readonly styles: ReadonlyMap<string, VennStyleProperties>;
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
    const key = idsKey(node.sets);
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
    const fewOffset = nodes.length <= m.fewNodes ? m.fewNodesOffset * scale : 0;
    const startX = centre.x - innerWidth / 2;
    const startY = centre.y - innerHeight / 2 + labelOffsetBase + fewOffset;
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
      const style = parts.styles.get(idsKey([node.id]));
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
        ...(style ? { style } : {}),
      };
    });
    out.push({
      sets: area.sets,
      inner: { x: centre.x, y: centre.y, radius: innerRadius },
      grid: { x: startX, y: startY, width: innerWidth, height: innerHeight },
      nodes: placed,
    });
  }
  return out;
}
