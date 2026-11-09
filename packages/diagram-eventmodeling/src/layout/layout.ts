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
 * middle (D521); box text is the bold name and the data in mono (D523), wrapped at 430, measured
 * with the theme font; the margin is `eventmodeling.padding` around what is drawn (D224). New: a
 * frame that names itself as its source gets a loop over its box's top (v12 drew a line through
 * the box), and text past the greatest box height is left out and flagged (v12 clipped it).
 */
import type { RenderContext } from '@mermaid-js/core';
import {
  layoutLabel,
  Style,
  type FontKey,
  type MeasuredLabel,
  type Run,
} from '@mermaid-js/core/text';
import { EVENTMODELING_CONFIG_INVALID } from '../codes.ts';
import type { EventModel, EventModelFrame } from '../model.ts';
import { eventModelStructure, type EventModelRelation } from '../structure.ts';
import {
  EVENTMODELING_METRICS as M,
  FONT_WEIGHT,
  share,
  SOURCE_ANCHOR,
  TARGET_ANCHOR,
} from './metrics.ts';
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

/** What the layout reads from the render context (`warn` for `EVENTMODELING_CONFIG_INVALID`). */
export type EventModelLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'warn'>>;

interface Env {
  readonly font: FontKey;
  /** `text` through core's label layout in the layout's font, wrapped at `wrap`. */
  label(text: string, wrap: number, style: number): MeasuredLabel;
  /** The width of `text` in mono. */
  monoWidth(text: string): number;
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
  const { measurer } = ctx;
  const env: Env = {
    font,
    label: (text, wrap, style) => layoutLabel(text, font, wrap, measurer, { style }),
    monoWidth: (text) => measurer.width(text, font, Style.Mono),
  };
  const padding = paddingOf(ctx);
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

  // Lanes: stacked in index order.
  const lanes: EventModelLaneLayout[] = [];
  let y = 0;
  for (const [k, lane] of structure.lanes.entries()) {
    const height = Math.max(M.laneMinHeight, laneTallest[k] ?? 0) + 2 * M.lanePadding;
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
    return { ...b, y: top, ...placeText(texts[k] as BoxText, b.x, top, b.width, b.height) };
  });

  const relations = structure.relations.map((r) => relationOf(r, structure.boxes, boxes, lanes));
  return {
    font,
    radius: M.radius,
    lanes,
    boxes,
    relations,
    padding,
    bounds: inflate(union(drawn(lanes, boxes, relations)), padding),
  };
}

/** `eventmodeling.padding`: a number of 0 or more (or a numeric string), else 30 with a warning. */
function paddingOf(ctx: EventModelLayoutContext): number {
  const section = (ctx.config as { eventmodeling?: { padding?: unknown } }).eventmodeling;
  const given = section?.padding;
  if (given === undefined) return M.padding;
  let n = Number.NaN;
  if (typeof given === 'number') n = given;
  else if (typeof given === 'string' && given.trim() !== '') n = Number(given);
  if (Number.isFinite(n) && n >= 0) return n;
  ctx.warn?.({
    code: EVENTMODELING_CONFIG_INVALID,
    message: `Ignored eventmodeling.padding: ${JSON.stringify(given)} is not a number of 0 or more; using ${M.padding}`,
    path: 'eventmodeling.padding',
  });
  return M.padding;
}

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
  const fullData = data === undefined ? undefined : dataLabel(env, data);
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

/**
 * The data as one left-aligned label in mono: each source line laid out on its own, wrapped at
 * 430 less its indentation, which `indents` keeps (core's label layout collapses leading blanks).
 * A blank line stays a blank line.
 */
function dataLabel(env: Env, text: string): MeasuredLabel {
  const lines: Run[][] = [];
  const indents: number[] = [];
  const widths: number[] = [];
  let lineHeight = 0;
  let baseline = 0;
  for (const source of text.split('\n')) {
    const body = source.trimStart();
    const lead = source.slice(0, source.length - body.length);
    const indent = lead === '' ? 0 : Math.min(env.monoWidth(lead), M.textWrap / 2);
    const label = env.label(body, M.textWrap - indent, Style.Mono);
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
  return measured(lines, indents, widths, lineHeight, baseline, true);
}

function measured(
  lines: Run[][],
  indents: number[],
  widths: number[],
  lineHeight: number,
  baseline: number,
  left: boolean
): MeasuredLabel {
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
  return measured(
    label.lines.slice(0, n),
    label.indents.slice(0, n),
    label.widths.slice(0, n),
    label.lineHeight,
    label.baseline,
    label.left === true
  );
}

/**
 * The text block centred in the box (v12's middle-aligned table cell inside the 10 px inset):
 * the name centred on the box, the data starting at the text area's left edge.
 */
function placeText(
  text: BoxText,
  x: number,
  y: number,
  width: number,
  height: number
): Pick<EventModelBoxLayout, 'name' | 'data'> {
  const inset = M.boxPadding + M.boxTextPadding;
  const top = y + (height - text.height) / 2;
  const name = placed(text.name, x + (width - text.name.width) / 2, top);
  if (!text.data) return { name };
  return { name, data: placed(text.data, x + inset, top + text.name.height + text.gap) };
}

function relationOf(
  r: EventModelRelation,
  structureBoxes: readonly { readonly lane: number }[],
  boxes: readonly EventModelBoxLayout[],
  lanes: readonly EventModelLaneLayout[]
): EventModelRelationLayout {
  const s = boxes[r.source] as EventModelBoxLayout;
  const t = boxes[r.target] as EventModelBoxLayout;
  const sLane = structureBoxes[r.source]?.lane ?? 0;
  const tLane = structureBoxes[r.target]?.lane ?? 0;
  let route: EventModelRoute;
  let points: Point[];
  if (r.source === r.target) {
    route = 'self';
    const from = s.x + share(s.width, SOURCE_ANCHOR);
    const to = s.x + share(s.width, TARGET_ANCHOR);
    const over = s.y - M.selfLoopRise;
    points = [
      { x: from, y: s.y },
      { x: from, y: over },
      { x: to, y: over },
      { x: to, y: s.y },
    ];
  } else if (sLane === tLane) {
    route = 'along';
    points = [
      { x: s.x + s.width, y: s.y + s.height / 2 },
      { x: t.x, y: t.y + t.height / 2 },
    ];
  } else {
    const up = (lanes[sLane]?.y ?? 0) > (lanes[tLane]?.y ?? 0);
    route = up ? 'up' : 'down';
    points = [
      { x: s.x + share(s.width, SOURCE_ANCHOR), y: up ? s.y : s.y + s.height },
      { x: t.x + share(t.width, TARGET_ANCHOR), y: up ? t.y + t.height : t.y },
    ];
  }
  return {
    source: r.source,
    target: r.target,
    inferred: r.inferred,
    id: r.id,
    ...(r.astId === undefined ? {} : { astId: r.astId }),
    route,
    points,
    head: headOf(points),
  };
}

/** v12's arrowhead (`0 0, 10 3.5, 0 7`, tip at the line's end) along the last segment. */
function headOf(points: readonly Point[]): [Point, Point, Point] {
  const tip = points[points.length - 1] as Point;
  const from = points[points.length - 2] ?? tip;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 0;
  const uy = length > 0 ? dy / length : 1;
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

/** The smallest rectangle holding every one of `rects`; a zero box at the origin for none. */
function union(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const inflate = (r: Rect, by: number): Rect => ({
  x: r.x - by,
  y: r.y - by,
  width: r.width + 2 * by,
  height: r.height + 2 * by,
});
