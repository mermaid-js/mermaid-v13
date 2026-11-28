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
import { formatList } from '@mermaid-js/core/parser-kit';
import {
  layoutLabel,
  markdownString,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import { VENN_ZERO_SET } from '../codes.ts';
import { vennLayoutConfig } from '../config.ts';
import { idsKey, pairwiseRule, setIdOf, type VennModel, type VennSubset } from '../model.ts';
import { idText } from '../parser/text.ts';
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
  Circle,
  PlacedLabel,
  Point,
  Rect,
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
  // A markdown string is laid out as markdown without its wrapper, any other text plain (D710).
  const measure = (text: string, labelFont: FontKey, maxWidth: number): MeasuredLabel => {
    const { text: source, markup } = markdownString(text);
    return layoutLabel(source, labelFont, maxWidth, ctx.measurer, {
      ...inline,
      markup,
      keepWords: true,
    });
  };

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
    labels,
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
    const ids = formatList([...zero].map((id) => `\`${idText(id)}\``));
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
  /** The placed labels, by area: a grid starts below its own and those it meets (D750). */
  readonly labels: ReadonlyMap<string, PlacedLabel | undefined>;
  readonly font: FontKey;
  readonly measure: Measure;
  readonly styles: ReadonlyMap<string, VennStyleProperties>;
}

/**
 * v12 `renderTextNodes`: each area's text nodes in a grid about its text centre. In an area
 * with a placed label the grid starts below that label and every other one it would meet, and
 * stays inside the inner circle where its nodes fit (D750, {@link clearGrid}).
 */
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
    const inner = { x: centre.x, y: centre.y, radius: innerRadius };
    const v12Grid = {
      x: centre.x - innerWidth / 2,
      y: centre.y - innerHeight / 2 + labelOffsetBase + fewOffset,
      width: innerWidth,
      height: innerHeight,
    };
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
    const rows = Math.max(1, Math.ceil(nodes.length / cols));
    const cells = { inner, v12: v12Grid, nodes, cols, rows, own: parts.labels.get(key) };
    const v12Nodes = placeNodes(cells, v12Grid, parts);
    const cleared = clearGrid(cells, v12Nodes, parts);
    const grid = cleared?.grid ?? v12Grid;
    const placed = cleared ? placeNodes(cleared.cells, grid, parts) : v12Nodes;
    out.push({ sets: area.sets, inner, grid, nodes: placed });
  }
  return out;
}

/** One area's text nodes and what their grid is made from. */
interface GridCells {
  readonly inner: Readonly<Circle>;
  /** v12's grid: its width caps the new one, its top is the highest the new one starts. */
  readonly v12: Rect;
  readonly nodes: VennModel['textNodes'];
  readonly cols: number;
  readonly rows: number;
  /** The area's placed label, if any. */
  readonly own: PlacedLabel | undefined;
}

/** `cells`' nodes in `grid`, row by row, each wrapped to its box (90 % of its cell). */
function placeNodes(cells: GridCells, grid: Rect, parts: GridParts): VennTextNodeLayout[] {
  const { cellFactor } = VENN_METRICS;
  const cellWidth = grid.width / cells.cols;
  const cellHeight = grid.height / cells.rows;
  return cells.nodes.map((node, i) => {
    const col = i % cells.cols;
    const row = Math.floor(i / cells.cols);
    const x = grid.x + cellWidth * (col + 1 / 2);
    const y = grid.y + cellHeight * (row + 1 / 2);
    const boxWidth = cellWidth * cellFactor;
    const boxHeight = cellHeight * cellFactor;
    const text = parts.measure(node.label ?? node.id, parts.font, boxWidth);
    const style = parts.styles.get(idsKey([node.id]));
    return {
      ast: node.ast,
      id: node.id,
      cell: {
        x: grid.x + cellWidth * col,
        y: grid.y + cellHeight * row,
        width: cellWidth,
        height: cellHeight,
      },
      box: { x: x - boxWidth / 2, y: y - boxHeight / 2, width: boxWidth, height: boxHeight },
      label: placeCentred(text, x, y),
      ...(style ? { style } : {}),
    };
  });
}

/**
 * D750: the grid of an area with a placed label, or of one whose nodes in v12's grid meet a
 * label, with its {@link fewerColumns}; undefined for any other area, which keeps v12's grid.
 * It starts `labelTextGap` below the area's own label (or the labels its nodes met), and below
 * every label its node boxes would then meet, and is {@link fitted} under that line. Only the
 * boxes count: an empty cell or the room between boxes may lie on a label, so a grid moves
 * down only for a label that one of its nodes would meet.
 */
function clearGrid(
  v12Cells: GridCells,
  v12Nodes: readonly VennTextNodeLayout[],
  parts: GridParts
): { cells: GridCells; grid: Rect } | undefined {
  const gap = VENN_METRICS.labelTextGap * parts.scale;
  const labels = [...parts.labels.values()].filter((l): l is PlacedLabel => l !== undefined);
  const first = v12Cells.own
    ? [v12Cells.own]
    : labels.filter((l) => v12Nodes.some((n) => overlaps(n.label, l)));
  if (first.length === 0) return undefined;
  const cells = fewerColumns(v12Cells, parts);
  const below = (met: readonly PlacedLabel[]): number =>
    Math.max(...met.map((l) => l.y + l.height + gap));
  let grid = fitted(cells, Math.max(cells.v12.y, below(first)), parts);
  // Each pass starts the grid below a label a node box met, so it meets that one no more.
  for (;;) {
    const boxes = placeNodes(cells, grid, parts).map((n) => n.box);
    const met = labels.filter((l) => boxes.some((b) => overlaps(b, l)));
    if (met.length === 0) return { cells, grid };
    grid = fitted(cells, below(met), parts);
  }
}

/**
 * The grid whose top is `top`, centred on the inner circle, each row as high as its tallest
 * node over `cellFactor`. It starts at v12's width and narrows to the inner circle's chord at
 * its edge farther from the centre, pass by pass (narrower boxes wrap the nodes onto more
 * lines), while every node still fits its box and the grid stays above the circle's bottom:
 * then its cells are inside the inner circle.
 */
function fitted(cells: GridCells, top: number, parts: GridParts): Rect {
  const m = VENN_METRICS;
  const { scale } = parts;
  const least = { width: m.textBoxMinWidth * scale, height: m.textBoxMinHeight * scale };
  const fit = (width: number): { height: number; fits: boolean } => {
    const { texts, fits } = boxed(cells, cells.cols, width, parts);
    const tallest = Math.max(...texts.map((t) => t.height));
    return { height: Math.max(least.height, (cells.rows * tallest) / m.cellFactor), fits };
  };
  let width = cells.v12.width;
  let { height } = fit(width);
  for (let pass = 0; pass < m.gridPasses; pass++) {
    const next = Math.max(least.width, Math.min(width, chord(cells.inner, top, height)));
    if (next >= width) break;
    const at = fit(next);
    // Narrower boxes that push the grid past the circle's bottom gain nothing.
    if (!at.fits || top + at.height > cells.inner.y + cells.inner.radius) break;
    width = next;
    height = at.height;
  }
  return { x: cells.inner.x - width / 2, y: top, width, height };
}

/**
 * `cells` in as many columns as v12's, or fewer, as the widest word of any node (its width
 * wrapped at 0) then fits its box at v12's width: a word wider than its box would run into its
 * neighbours. One column when none fits.
 */
function fewerColumns(cells: GridCells, parts: GridParts): GridCells {
  const word = Math.max(
    ...cells.nodes.map((n) => parts.measure(n.label ?? n.id, parts.font, 0).width)
  );
  const room = Math.floor((cells.v12.width * VENN_METRICS.cellFactor) / word);
  const cols = Math.max(1, Math.min(cells.cols, room));
  if (cols === cells.cols) return cells;
  return { ...cells, cols, rows: Math.ceil(cells.nodes.length / cols) };
}

/** `cells`' nodes wrapped to their boxes in a grid `width` wide of `cols` columns. */
function boxed(
  cells: GridCells,
  cols: number,
  width: number,
  parts: GridParts
): { texts: MeasuredLabel[]; fits: boolean } {
  const box = (width / cols) * VENN_METRICS.cellFactor;
  const texts = cells.nodes.map((n) => parts.measure(n.label ?? n.id, parts.font, box));
  return { texts, fits: texts.every((t) => t.width <= box) };
}

/**
 * The width of `inner` at the edge of a band from `top`, `height` high, farther from its
 * centre; at the top edge when the band reaches past the circle.
 */
function chord(inner: Readonly<Circle>, top: number, height: number): number {
  const r = inner.radius;
  const d0 = top - inner.y;
  const d1 = d0 + height;
  const far = d1 <= r ? Math.max(Math.abs(d0), d1) : Math.abs(d0);
  return 2 * Math.sqrt(Math.max(0, r * r - far * far));
}
