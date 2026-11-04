// Messages: the line or self loop, its arrowheads as inline paths (no `<marker>`, so no ids),
// the central-connection circles and the sequence number badge. The head shapes are v12's
// marker paths (`svgDraw.js` `insertArrowHead` and friends), placed and turned in JS the way
// the browser placed the markers: `refX`/`refY` on the line end, the marker's x axis along the
// line, scaled by the line's stroke width where v12's marker used `markerUnits="strokeWidth"`.
import type { Attrs, Paint, SafeValue, SvgWriter } from '@mermaid-js/core/svg';
import type { ArrowKind } from '../model.ts';
import type { MessageLayout, ParticipantLayout } from '../layout/index.ts';
import { REVERSE_ARROWS } from '../layout/index.ts';

type Point = readonly [number, number];

/** One v12 marker: its outline (or strokes), its reference point and its scale. */
interface HeadShape {
  /** Polygons (filled) or polylines (stroked), in marker units. */
  readonly paths: readonly (readonly Point[])[];
  readonly ref: Point;
  readonly scale: number;
  readonly stroked: boolean;
  /** Stroke width in user units, for stroked heads and the outline of a filled one. */
  readonly strokeWidth?: number;
}

/** The message line's width (v12 `.messageLine0/1`), which strokeWidth markers scale with. */
export const MESSAGE_STROKE = 1.5;
const DOTTED = '3, 3' as SafeValue;

const HEADS = {
  // `-arrowhead`, markerUnits userSpaceOnUse; v12 CSS fills and strokes it in signalColor.
  arrow: {
    paths: [
      [
        [-1, 0],
        [10, 5],
        [0, 10],
      ],
    ],
    ref: [7.9, 5],
    scale: 1,
    stroked: false,
    strokeWidth: 1,
  },
  // `-filled-head` (`-)`), markerUnits strokeWidth.
  open: {
    paths: [
      [
        [18, 7],
        [9, 13],
        [14, 7],
        [9, 1],
      ],
    ],
    ref: [15.5, 7],
    scale: MESSAGE_STROKE,
    stroked: false,
  },
  // `-crosshead` (`-x`), markerUnits strokeWidth, stroked 1pt.
  cross: {
    paths: [
      [
        [1, 2],
        [6, 7],
      ],
      [
        [6, 2],
        [1, 7],
      ],
    ],
    ref: [4, 4.5],
    scale: MESSAGE_STROKE,
    stroked: true,
    strokeWidth: (4 / 3) * MESSAGE_STROKE,
  },
  solidTop: {
    paths: [
      [
        [0, 0],
        [10, 8],
        [0, 8],
      ],
    ],
    ref: [7.9, 7.25],
    scale: 1,
    stroked: false,
  },
  solidBottom: {
    paths: [
      [
        [0, 0],
        [10, 0],
        [0, 8],
      ],
    ],
    ref: [7.9, 0.75],
    scale: 1,
    stroked: false,
  },
  stickTop: {
    paths: [
      [
        [0, 0],
        [7, 7],
      ],
    ],
    ref: [7.5, 7],
    scale: 1,
    stroked: true,
    strokeWidth: 1.5,
  },
  stickBottom: {
    paths: [
      [
        [0, 7],
        [7, 0],
      ],
    ],
    ref: [7.5, 0],
    scale: 1,
    stroked: true,
    strokeWidth: 1.5,
  },
} satisfies Record<string, HeadShape>;

type HeadName = keyof typeof HEADS;

/** The head at the line's end (v12 `marker-end`). */
const END: Partial<Record<ArrowKind, HeadName>> = {
  solid: 'arrow',
  dotted: 'arrow',
  bidirectional_solid: 'arrow',
  bidirectional_dotted: 'arrow',
  solid_point: 'open',
  dotted_point: 'open',
  solid_cross: 'cross',
  dotted_cross: 'cross',
  solid_top: 'solidTop',
  solid_top_dotted: 'solidTop',
  solid_bottom: 'solidBottom',
  solid_bottom_dotted: 'solidBottom',
  stick_top: 'stickTop',
  stick_top_dotted: 'stickTop',
  stick_bottom: 'stickBottom',
  stick_bottom_dotted: 'stickBottom',
};

/** The head at the line's start (v12 `marker-start`, `auto-start-reverse`). */
const START: Partial<Record<ArrowKind, HeadName>> = {
  bidirectional_solid: 'arrow',
  bidirectional_dotted: 'arrow',
  solid_arrow_top_reverse: 'solidBottom',
  solid_arrow_top_reverse_dotted: 'solidBottom',
  solid_arrow_bottom_reverse: 'solidTop',
  solid_arrow_bottom_reverse_dotted: 'solidTop',
  stick_arrow_top_reverse: 'stickBottom',
  stick_arrow_top_reverse_dotted: 'stickBottom',
  stick_arrow_bottom_reverse: 'stickTop',
  stick_arrow_bottom_reverse_dotted: 'stickTop',
};

const isDotted = (arrow: ArrowKind): boolean => arrow.includes('dotted');
const isBidirectional = (arrow: ArrowKind): boolean => arrow.startsWith('bidirectional');

/** `points` in a marker's units, placed with `ref` on `at` and turned by `angle` radians. */
export function placePoints(
  points: readonly Point[],
  ref: Point,
  scale: number,
  at: Point,
  angle: number
): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: number[] = [];
  for (const [px, py] of points) {
    const dx = (px - ref[0]) * scale;
    const dy = (py - ref[1]) * scale;
    out.push(at[0] + dx * cos - dy * sin, at[1] + dx * sin + dy * cos);
  }
  return out;
}

function drawHead(w: SvgWriter, name: HeadName, at: Point, angle: number, paint: Paint): void {
  const head: HeadShape = HEADS[name];
  for (const path of head.paths) {
    const points = placePoints(path, head.ref, head.scale, at, angle);
    if (head.stroked)
      w.leaf('polyline', {
        class: 'arrowhead',
        points,
        fill: 'none',
        stroke: paint,
        'stroke-width': head.strokeWidth,
      });
    else
      w.leaf('polygon', {
        class: 'arrowhead',
        points,
        fill: paint,
        stroke: head.strokeWidth === undefined ? undefined : paint,
        'stroke-width': head.strokeWidth,
      });
  }
}

/** v12 drew a sequence number as a marker circle of r 6 on a line whose CSS width was 2px. */
const NUMBER_RADIUS = 12;
/** v12 `SEQUENCE_NUMBER_RADIUS`: how far a numbered line moves its start or end. */
const NUMBER_SHIFT = 6;
const NUMBER_BASELINE = 4;
const SELF_NUMBER_SHIFT = 10;
const CENTRAL_RADIUS = 5;
const CENTRAL_NUMBER_OFFSET = 16.5;

export interface MessagePaint {
  readonly line: Paint;
  readonly text: Paint;
  readonly number?: { readonly fill: Paint; readonly text: Paint };
}

/** The x a line starts and ends at, moved clear of a sequence number as v12 moved it. */
function lineEnds(m: MessageLayout): [number, number] {
  let x1 = m.startX;
  let x2 = m.stopX;
  if (!m.number || m.self) return [x1, x2];
  const ltr = m.startX < m.stopX;
  if (isBidirectional(m.arrow)) x1 = ltr ? x1 + 2 * NUMBER_SHIFT : x1 - NUMBER_SHIFT;
  else if (REVERSE_ARROWS.has(m.arrow)) x2 = ltr ? x2 - 2 * NUMBER_SHIFT : x2 - NUMBER_SHIFT;
  else x1 += NUMBER_SHIFT;
  return [x1, x2];
}

/** The line (or self loop) and its heads. */
export function drawMessageLine(
  w: SvgWriter,
  m: MessageLayout,
  rightAngles: boolean,
  paint: MessagePaint
): void {
  const lineAttrs: Attrs = {
    class: isDotted(m.arrow) ? 'messageLine1' : 'messageLine0',
    fill: 'none',
    stroke: paint.line,
    'stroke-width': MESSAGE_STROKE,
    'stroke-dasharray': isDotted(m.arrow) ? DOTTED : undefined,
  };
  const end = END[m.arrow];
  const start = START[m.arrow];
  if (m.self) {
    const y = m.y;
    const x = m.startX;
    const x0 =
      x + (m.number && (start !== undefined || isBidirectional(m.arrow)) ? SELF_NUMBER_SHIFT : 0);
    const { right, bottom } = m.self;
    const p = w.path().moveTo(x0, y);
    let endAngle: number;
    let startAngle: number;
    if (rightAngles) {
      p.lineTo(right, y).lineTo(right, bottom).lineTo(x, bottom);
      endAngle = Math.PI;
      startAngle = Math.PI;
    } else {
      // v12: `C x+60,y-10 x+60,y+30 x,y+20`, with the reach and drop from the layout.
      const drop = bottom - y;
      const c1: Point = [x0 + (right - x), y - drop / 2];
      const c2: Point = [right, y + (drop * 3) / 2];
      p.curveTo(c1[0], c1[1], c2[0], c2[1], x, bottom);
      endAngle = Math.atan2(bottom - c2[1], x - c2[0]);
      startAngle = Math.atan2(c1[1] - y, c1[0] - x0) + Math.PI;
    }
    w.leaf('path', { ...lineAttrs, d: p.done() });
    if (end) drawHead(w, end, [x, bottom], endAngle, paint.line);
    if (start) drawHead(w, start, [x0, y], startAngle, paint.line);
    return;
  }
  const [x1, x2] = lineEnds(m);
  w.leaf('line', { ...lineAttrs, x1, y1: m.y, x2, y2: m.y });
  const angle = x2 >= x1 ? 0 : Math.PI;
  if (end) drawHead(w, end, [x2, m.y], angle, paint.line);
  if (start) drawHead(w, start, [x1, m.y], angle + Math.PI, paint.line);
}

/** Central connection circles `()` on the lifelines (v12 `drawCentralConnection`). */
export function drawCentral(
  w: SvgWriter,
  m: MessageLayout,
  columns: ReadonlyMap<string, ParticipantLayout>,
  fill: Paint
): void {
  if (!m.central) return;
  const from = columns.get(m.from);
  const to = columns.get(m.to);
  if (!from || !to) return;
  let fromX = from.lifeline.x;
  let toX = to.lifeline.x;
  const ltr = fromX <= toX;
  const reverse = REVERSE_ARROWS.has(m.arrow);
  const offset = ltr ? CENTRAL_NUMBER_OFFSET : -CENTRAL_NUMBER_OFFSET;
  if (m.number) {
    if (m.central === 'to' && reverse) toX -= offset;
    if (m.central === 'from' && !reverse) fromX += offset;
    if (m.central === 'both') {
      if (reverse) toX -= offset;
      else fromX += offset;
    }
  }
  const circle = (cx: number): void =>
    w.leaf('circle', { class: 'centralConnection', cx, cy: m.y, r: CENTRAL_RADIUS, fill });
  if (m.central === 'from' || m.central === 'both') circle(fromX);
  if (m.central === 'to' || m.central === 'both') circle(toX);
}

/** The autonumber badge: a filled circle and the number (v12 `-sequencenumber` marker). */
export function drawNumber(w: SvgWriter, m: MessageLayout, paint: MessagePaint): void {
  if (!m.number || !paint.number) return;
  const { value, x } = m.number;
  const text = String(value);
  let size = 12;
  if (text.length > 5) size = 7;
  else if (text.length > 3) size = 9;
  w.leaf('circle', {
    class: 'sequenceNumberCircle',
    cx: x,
    cy: m.y,
    r: NUMBER_RADIUS,
    fill: paint.number.fill,
  });
  w.open('text', {
    class: 'sequenceNumber',
    x,
    y: m.y + NUMBER_BASELINE,
    'font-family': 'sans-serif' as SafeValue,
    'font-size': size,
    'text-anchor': 'middle',
    fill: paint.number.text,
  });
  w.text(text);
  w.close();
}
