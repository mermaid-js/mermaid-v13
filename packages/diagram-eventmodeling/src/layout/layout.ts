/**
 * The event modeling custom layout (spec #527 T3, `layoutKind: 'custom'`): `EventModel` in,
 * `EventModelLayout` out. It places what `eventModelStructure` gives (lanes, boxes, relations,
 * in v12's order) as v12's `getState()` and renderer did (`db.ts:381-498`, `renderer.ts`),
 * without the drawing or module state (R-ARCH-4). Every text is measured first, through core's
 * label layout and the injected measurer (pitfall 16); every length comes from the metrics table
 * (pitfall 13).
 *
 * Kept from v12: the first box at x 250; a box in the lane of the frame before it 10 after that
 * lane's right edge, else 80 before the previous box's `r` (`x + w + 10`), the stagger; boxes
 * top-aligned 15 below their lane's top; a box `clamp(text + 20, 80, 450) + 20` by
 * `clamp(text + 20, 80, 750) + 20`; lanes in index order, 10 apart, `max(70, tallest) + 30`
 * high, from x 0 to 15 past `maxR`; the lane label's baseline at `(30, lane.y + 30)`; relations
 * between lanes one segment from ⅔ of the source's width to ⅓ of the target's, bottom to top or
 * top to bottom, with v12's 10 × 7 head, tip at the end.
 *
 * Changed, as decided: each box at `max(stagger, lane.r + 10)`, so boxes never overlap (D521); a
 * relation within a lane from the source's right edge to the target's left edge, at each box's
 * middle (D521), and one that skips a box of its lane under the row instead (D659, `under.ts`),
 * the lanes holding one grown to fit while every box keeps v12's top; box text is the bold name and the data in mono, as written (D523), wrapped at
 * 430, measured with the theme font; the margin is `eventmodeling.padding` around what is drawn
 * (D224). New: a frame that names itself as its source gets a loop under its box's bottom right
 * corner, clear of the other relations' ends (D659; v12 drew a line through the box), and text past the
 * greatest box height is left out and flagged (v12 clipped it). Relations leaving one side of a
 * box leave from distinct points, and one between lanes that would meet another box goes around
 * it (D743, `detour.ts`).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
  type Run,
} from '@mermaid-js/core/text';
import { tagsOnly } from '@mermaid-js/core/text/tags-only';
import { eventModelingConfig } from '../config.ts';
import type { EventModel, EventModelFrame } from '../model.ts';
import { eventModelStructure, type EventModelRelation } from '../structure.ts';
import { expandTabs } from '../tabs.ts';
import { detourRoutes, type DetourLine } from './detour.ts';
import {
  departure,
  departureBeforeLoop,
  EVENTMODELING_METRICS as M,
  FONT_WEIGHT,
  share,
  SOURCE_ANCHOR,
  TARGET_ANCHOR,
} from './metrics.ts';
import { planUnder, type UnderRoute } from './under.ts';
import type {
  EventModelBoxLayout,
  EventModelLaneLayout,
  EventModelLayout,
  EventModelRelationLayout,
  EventModelRoute,
  PlacedLabel,
  Point,
  Rect,
} from './types.ts';
import { unionRects } from '@mermaid-js/shared/layout';
import { growRect } from '@mermaid-js/core/layout';

/**
 * What the layout reads from the render context (`warn` for `EVENTMODELING_CONFIG_INVALID`,
 * `inline` for the HTML tags its labels lose).
 */
export type EventModelLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn' | 'inline'>>;

interface Env {
  /** `text` through core's label layout in the layout's font, wrapped at `wrap`. */
  label(text: string, wrap: number, style: number): MeasuredLabel;
  /** The width of `text` in mono. */
  monoWidth(text: string): number;
}

/** The label and width measurements of one layout, in its font. */
function environment(font: FontKey, { measurer, inline }: EventModelLayoutContext): Env {
  // No inline boxes here.
  const options = { inline: tagsOnly(inline) };
  return {
    label: (text, wrap, style) => layoutLabel(text, font, wrap, measurer, { ...options, style }),
    monoWidth: (text) => measurer.width(text, font, Style.Mono),
  };
}

/** Lays out an event model in px. */
export function layoutEventModel(
  model: EventModel,
  ctx: EventModelLayoutContext
): EventModelLayout {
  const font: FontKey = {
    family: ctx.theme.value('fontFamily'),
    size: ctx.theme.number('fontSize'),
    weight: FONT_WEIGHT,
  };
  const env = environment(font, ctx);
  const { padding } = eventModelingConfig(ctx.config.eventmodeling, ctx.warn ?? ignore);
  const structure = eventModelStructure(model);

  // Boxes: sized from their text, then placed left to right (D521).
  const laneRight: (number | undefined)[] = structure.lanes.map(() => undefined);
  const laneTallest: number[] = structure.lanes.map(() => 0);
  const sized: Omit<EventModelBoxLayout, 'y' | 'name' | 'data'>[] = [];
  const texts: BoxText[] = [];
  let previous: { x: number; width: number } | undefined;
  for (const box of structure.boxes) {
    const frame = model.frames[box.frame] as EventModelFrame;
    const text = boxText(env, box.name, box.data);
    const width = clamp(text.width + 2 * M.boxTextPadding, M.boxMinWidth, M.boxMaxWidth);
    const height = clamp(text.height + 2 * M.boxTextPadding, M.boxMinHeight, M.boxMaxHeight);
    const w = width + 2 * M.boxPadding;
    const h = height + 2 * M.boxPadding;
    const right = laneRight[box.lane];
    let x: number = M.contentStartX;
    if (previous) {
      const stagger = previous.x + previous.width + 2 * M.boxPadding - M.boxOverlap;
      x = right === undefined ? stagger : Math.max(stagger, right + M.boxPadding);
    }
    laneRight[box.lane] = x + w;
    laneTallest[box.lane] = Math.max(laneTallest[box.lane] ?? 0, h);
    previous = { x, width: w };
    texts.push(text);
    sized.push({
      frame: box.frame,
      ast: frame.astId,
      kind: frame.kind,
      lane: box.lane,
      x,
      width: w,
      height: h,
      ...(text.clipped ? { clipped: true as const } : {}),
    });
  }
  let maxR = 0;
  for (const b of sized) maxR = Math.max(maxR, b.x + b.width + M.boxPadding);

  // The routes under a row (D659), in depths below the lane top, so their lanes can grow.
  const under = planUnder(structure.relations, sized, structure.lanes.length);

  // Lanes: stacked in index order.
  const lanes: EventModelLaneLayout[] = [];
  let y = 0;
  for (const [k, lane] of structure.lanes.entries()) {
    // A lane holding a route under its row or a self loop reaches `lanePadding` below it (D659).
    const fit = Math.max(M.laneMinHeight, laneTallest[k] ?? 0) + 2 * M.lanePadding;
    const height = Math.max(fit, (under.depth[k] as number) + M.lanePadding);
    const text = env.label(lane.label, Infinity, Style.Bold);
    const labelAt = { x: M.laneLabelX, y: y + M.laneLabelY };
    lanes.push({
      index: lane.index,
      band: lane.band,
      ...(lane.namespace === undefined ? {} : { namespace: lane.namespace }),
      id: `lane:${lane.index}`,
      x: 0,
      y,
      width: maxR + M.lanePadding,
      height,
      labelAt,
      label: placed(text, labelAt.x, labelAt.y - text.baseline),
    });
    y += height + M.laneGap;
  }

  const boxes: EventModelBoxLayout[] = sized.map((b, k) => {
    const top = (lanes[b.lane]?.y ?? 0) + M.lanePadding;
    return { ...b, y: top, ...placeText(texts[k] as BoxText, { ...b, y: top }) };
  });

  const departures = departuresOf(structure.relations, boxes, lanes);
  const first = structure.relations.map((r, k) =>
    relationOf(r, boxes, lanes, under.routes.get(k), departures.get(k))
  );
  // A relation between lanes that would meet another box takes a detour (D743).
  const lines = detourRoutes(first, boxes, lanes);
  const relations = first.map((r, k) => {
    const { points, noDetour } = lines[k] as DetourLine;
    return { ...r, points, head: headOf(points), ...(noDetour ? { noDetour } : {}) };
  });
  return {
    font,
    radius: M.radius,
    lanes,
    boxes,
    relations,
    padding,
    bounds: growRect(union(drawn(lanes, boxes, relations)), padding),
  };
}

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignore = (): void => undefined;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const placed = (text: MeasuredLabel, x: number, y: number): PlacedLabel => ({
  x,
  y,
  width: text.width,
  height: text.height,
  text,
});

/** A box's measured text: the name, the data, and the area they take together. */
interface BoxText {
  readonly name: MeasuredLabel;
  readonly data?: MeasuredLabel;
  /** Between the name and the data: one blank line (v12's `<br/><br/>`). */
  readonly gap: number;
  readonly width: number;
  readonly height: number;
  readonly clipped: boolean;
}

/**
 * The name (bold) and data (mono, D523), each wrapped at 430, and lines past what the greatest
 * box holds left out: the data's from the end first, then the name's.
 */
function boxText(env: Env, name: string, data: string | undefined): BoxText {
  const room = M.boxMaxHeight - 2 * M.boxTextPadding;
  const fullName = env.label(name, M.textWrap, Style.Bold);
  const nameLabel = upTo(fullName, room);
  const gap = nameLabel.lineHeight;
  // Empty data (`""`, `{}`, a `[[ref]]` to an empty block) is no data: no gap, no line.
  const fullData = data === undefined || data === '' ? undefined : dataLabel(env, data);
  const dataLabelFit =
    fullData === undefined ? undefined : upTo(fullData, room - nameLabel.height - gap);
  const shown = dataLabelFit && dataLabelFit.lines.length > 0 ? dataLabelFit : undefined;
  const clipped =
    nameLabel.lines.length < fullName.lines.length ||
    (fullData !== undefined && (shown?.lines.length ?? 0) < fullData.lines.length);
  return {
    name: nameLabel,
    ...(shown ? { data: shown } : {}),
    gap,
    width: Math.max(nameLabel.width, shown?.width ?? 0),
    // Clipped text keeps the box at its greatest height, as in v12.
    height: clipped ? room : nameLabel.height + (shown ? gap + shown.height : 0),
    clipped,
  };
}

/** The characters core's label layout reads as markup in plain text, as character references. */
const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '\\': '&#92;' };
const MARKUP = /[&<\\]/g;
const BLANKS = /[ \t]/g;

/**
 * `text` as written, through core's label layout (D523): `&`, `<` and `\` become character
 * references, which the layout decodes back to the characters after it has read tags, entities
 * and `\n` breaks, so none is read as markup and each is measured as drawn; each blank is a
 * no-break space, so a run of them stays (v12's `&nbsp;`) while a line can still wrap there. No
 * core change.
 */
const literal = (text: string): string =>
  text.replace(MARKUP, (m) => ESCAPES[m] ?? m).replace(BLANKS, '\u00a0');

/**
 * The data as one left-aligned label in mono: each source line laid out on its own, as written
 * ({@link literal}), wrapped at 430 less its indentation, which `indents` keeps. Tabs go to
 * the next tab stop first (`expandTabs`; the parser's data text has none left). A blank line
 * stays a blank line.
 */
function dataLabel(env: Env, text: string): MeasuredLabel {
  const lines: Run[][] = [];
  const indents: number[] = [];
  const widths: number[] = [];
  let lineHeight = 0;
  let baseline = 0;
  for (const written of text.split('\n')) {
    const source = expandTabs(written);
    const body = source.trimStart();
    const lead = source.slice(0, source.length - body.length);
    const indent = lead === '' ? 0 : Math.min(env.monoWidth(lead), M.textWrap / 2);
    const label = env.label(literal(body), M.textWrap - indent, Style.Mono);
    lineHeight = label.lineHeight;
    baseline = label.baseline;
    if (label.lines.length === 0) {
      lines.push([]);
      indents.push(0);
      widths.push(0);
      continue;
    }
    for (const [i, line] of label.lines.entries()) {
      lines.push(line);
      indents.push(indent + (label.indents[i] ?? 0));
      widths.push(indent + (label.widths[i] ?? 0));
    }
  }
  return measured({ lines, indents, widths, lineHeight, baseline, left: true });
}

/** The lines of a label and how they are set. */
interface LabelParts {
  readonly lines: Run[][];
  readonly indents: number[];
  readonly widths: number[];
  readonly lineHeight: number;
  readonly baseline: number;
  readonly left: boolean;
}

function measured({
  lines,
  indents,
  widths,
  lineHeight,
  baseline,
  left,
}: LabelParts): MeasuredLabel {
  let width = 0;
  for (const w of widths) width = Math.max(width, w);
  return {
    lines,
    indents,
    widths,
    width,
    height: lines.length * lineHeight,
    lineHeight,
    baseline,
    ...(left ? { left } : {}),
  };
}

/** `label` with only the lines that fit in `room`. */
function upTo(label: MeasuredLabel, room: number): MeasuredLabel {
  if (label.height <= room) return label;
  const n = label.lineHeight > 0 ? Math.max(0, Math.floor(room / label.lineHeight)) : 0;
  return measured({
    lines: label.lines.slice(0, n),
    indents: label.indents.slice(0, n),
    widths: label.widths.slice(0, n),
    lineHeight: label.lineHeight,
    baseline: label.baseline,
    left: label.left === true,
  });
}

/**
 * The text block centred in the box (v12's middle-aligned table cell inside the 10 px inset):
 * the name centred on the box, the data starting at the text area's left edge.
 */
function placeText(
  text: BoxText,
  { x, y, width, height }: Rect
): Pick<EventModelBoxLayout, 'name' | 'data'> {
  const inset = M.boxPadding + M.boxTextPadding;
  const top = y + (height - text.height) / 2;
  const name = placed(text.name, x + (width - text.name.width) / 2, top);
  if (!text.data) return { name };
  return { name, data: placed(text.data, x + inset, top + text.name.height + text.gap) };
}

/** Whether a relation between lanes runs up; `undefined` for one within a lane. */
function upward(
  r: EventModelRelation,
  boxes: readonly EventModelBoxLayout[],
  lanes: readonly EventModelLaneLayout[]
): boolean | undefined {
  const s = boxes[r.source] as EventModelBoxLayout;
  const t = boxes[r.target] as EventModelBoxLayout;
  if (s.lane === t.lane) return undefined;
  return (lanes[s.lane]?.y ?? 0) > (lanes[t.lane]?.y ?? 0);
}

/**
 * Where each relation between lanes leaves its source (D743): the relations that leave one side
 * of a box, ordered by where they meet their targets (then in v12's order), spread from v12's ⅔
 * to the right, so no two leave from one point; under a self loop, left of it. By relation index.
 */
function departuresOf(
  relations: readonly EventModelRelation[],
  boxes: readonly EventModelBoxLayout[],
  lanes: readonly EventModelLaneLayout[]
): Map<number, number> {
  // By source and side: `2 × source`, plus 1 for the top.
  const sides = new Map<number, { k: number; at: number }[]>();
  for (const [k, r] of relations.entries()) {
    const up = upward(r, boxes, lanes);
    if (up === undefined) continue;
    const t = boxes[r.target] as EventModelBoxLayout;
    const key = 2 * r.source + Number(up);
    const list = sides.get(key) ?? [];
    list.push({ k, at: t.x + share(t.width, TARGET_ANCHOR) });
    sides.set(key, list);
  }
  // A self loop hangs under its box's bottom (D659).
  const looped = new Set(relations.filter((r) => r.source === r.target).map((r) => 2 * r.source));
  const out = new Map<number, number>();
  for (const [key, list] of sides.entries()) {
    list.sort((a, b) => a.at - b.at || a.k - b.k);
    const spread = looped.has(key) ? departureBeforeLoop : departure;
    for (const [i, { k }] of list.entries()) {
      const s = boxes[(relations[k] as EventModelRelation).source] as EventModelBoxLayout;
      out.set(k, s.x + spread(s.width, i, list.length));
    }
  }
  return out;
}

/** A relation's route and first line; {@link detourRoutes} may redraw it and the head follows. */
function relationOf(
  r: EventModelRelation,
  boxes: readonly EventModelBoxLayout[],
  lanes: readonly EventModelLaneLayout[],
  below: UnderRoute | undefined,
  leaves: number | undefined
): Omit<EventModelRelationLayout, 'head'> {
  const s = boxes[r.source] as EventModelBoxLayout;
  const t = boxes[r.target] as EventModelBoxLayout;
  const laneTop = lanes[s.lane]?.y ?? 0;
  const [route, points] =
    bentRoute(r, s, t, laneTop, below) ?? straightRoute(s, t, upward(r, boxes, lanes), leaves);
  return {
    source: r.source,
    target: r.target,
    inferred: r.inferred,
    id: r.id,
    ...(r.astId === undefined ? {} : { astId: r.astId }),
    route,
    points,
  };
}

type Routed = [EventModelRoute, Point[]];

/** A self loop, or a relation under its row (D659); `undefined` for any other. */
function bentRoute(
  r: EventModelRelation,
  s: Rect,
  t: Rect,
  laneTop: number,
  below: UnderRoute | undefined
): Routed | undefined {
  if (r.source === r.target) {
    // Under the bottom right corner, clear of the anchors of the relations between lanes.
    const to = s.x + s.width - M.selfLoopInset;
    return ['self', underRow(s, s, to - M.selfLoopWidth, to, s.y + s.height + M.selfLoopDepth)];
  }
  if (!below) return undefined;
  return ['under', underRow(s, t, below.from, below.to, laneTop + below.depth)];
}

/**
 * A relation to the next box of its lane (`along`, D521), or between lanes: v12's segment to ⅓
 * of the target's width, from `leaves` on the source's edge (D743; v12's ⅔ when it is the only
 * relation leaving that side).
 */
function straightRoute(
  s: EventModelBoxLayout,
  t: EventModelBoxLayout,
  up: boolean | undefined,
  leaves: number | undefined
): Routed {
  if (up === undefined)
    return [
      'along',
      [
        { x: s.x + s.width, y: s.y + s.height / 2 },
        { x: t.x, y: t.y + t.height / 2 },
      ],
    ];
  return [
    up ? 'up' : 'down',
    [
      { x: leaves ?? s.x + share(s.width, SOURCE_ANCHOR), y: up ? s.y : s.y + s.height },
      { x: t.x + share(t.width, TARGET_ANCHOR), y: up ? t.y + t.height : t.y },
    ],
  ];
}

/** Down from the source's bottom at `from`, across at `channel`, up into the target's at `to`. */
function underRow(s: Rect, t: Rect, from: number, to: number, channel: number): Point[] {
  return [
    { x: from, y: s.y + s.height },
    { x: from, y: channel },
    { x: to, y: channel },
    { x: to, y: t.y + t.height },
  ];
}

/** v12's arrowhead (`0 0, 10 3.5, 0 7`, tip at the line's end) along the last segment. */
function headOf(points: readonly Point[]): [Point, Point, Point] {
  const tip = points[points.length - 1] as Point;
  const from = points[points.length - 2] ?? tip;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);
  return headAt(tip, length > 0 ? dx / length : 0, length > 0 ? dy / length : 1);
}

/**
 * The arrowhead with its tip at `tip`, pointing along the unit vector (`ux`, `uy`): base corner,
 * tip, base corner. The renderer takes the direction from the drawn path when a curve is set
 * (D760).
 */
export function headAt(tip: Point, ux: number, uy: number): [Point, Point, Point] {
  const bx = tip.x - ux * M.headLength;
  const by = tip.y - uy * M.headLength;
  const half = M.headWidth / 2;
  return [{ x: bx - uy * half, y: by + ux * half }, tip, { x: bx + uy * half, y: by - ux * half }];
}

/** Every drawn part as a rectangle: the bounds and the invariants' containment check read it. */
export function drawn(
  lanes: readonly EventModelLaneLayout[],
  boxes: readonly EventModelBoxLayout[],
  relations: readonly EventModelRelationLayout[]
): Rect[] {
  const out: Rect[] = [];
  for (const lane of lanes) out.push(lane, lane.label);
  for (const box of boxes) {
    out.push(box, box.name);
    if (box.data) out.push(box.data);
  }
  for (const r of relations)
    for (const p of [...r.points, ...r.head]) out.push({ x: p.x, y: p.y, width: 0, height: 0 });
  return out;
}

const union = unionRects;
