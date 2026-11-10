/**
 * The ishikawa layout's invariants (R-LAYOUT-3, spec #519 §Testing): what every layout of every
 * model must satisfy. Empty when they hold; otherwise one line per violation. The conformance
 * sweep runs them over the parser-produced corpus, the layout specs over the edge cases.
 *
 * - no number is NaN or infinite;
 * - there is one cause layout per cause, and causes alternate sides: even indices above the
 *   spine, odd below;
 * - every bone starts on its parent's line: a cause's on the spine, a sub-cause's on the bone of
 *   the cause it hangs from;
 * - every sub-cause's slot (the y its bone ends at) is inside its cause's bone, and inside a
 *   diagonal parent's bone;
 * - no cause's label box overlaps the head or the spine;
 * - everything drawn is inside `bounds`.
 *
 * Labels may overlap one another: v12's geometry allows it (the next pair starts at the previous
 * pair's text, so a box can reach over the next bone), and removing that is a follow-up with its
 * own decision. {@link ishikawaLabelOverlaps} reports them.
 */
import { sideOf, type IshikawaModel } from '../model.ts';
import { corners, ends, grown, inside, overlaps, segmentBox } from './geometry.ts';
import type {
  IshikawaBone,
  IshikawaCauseLayout,
  IshikawaHead,
  IshikawaLayout,
  Point,
  Rect,
  Segment,
} from './types.ts';

const EPS = 1e-6;

/** Every number in `value`, with its path. */
function* numbers(value: unknown, path: string): Generator<[string, number]> {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* numbers(v, `${path}.${k}`);
  }
}

/** A rectangle as a violation message prints it. */
const printed = (r: Rect): string =>
  `(${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.width.toFixed(2)} × ${r.height.toFixed(2)})`;

/** The causes in source order. */
const causesOf = (layout: IshikawaLayout): IshikawaCauseLayout[] =>
  layout.pairs.flatMap((p) => p.causes);

/** The violations of `layout`, laid out from `model`. */
export function ishikawaLayoutViolations(model: IshikawaModel, layout: IshikawaLayout): string[] {
  const out: string[] = [];
  for (const [path, n] of numbers(layout, 'layout')) {
    if (!Number.isFinite(n)) out.push(`${path} is ${n}`);
  }
  if (out.length > 0) return out;
  // Lengths are compared to the drawing: the tolerance scales with it.
  const eps = EPS * Math.max(1, layout.bounds.width, layout.bounds.height);
  alternating(model, layout, out);
  if (layout.spine) bonesOnParents(layout, layout.spine, eps, out);
  if (layout.head && layout.spine) boxesClear(layout, layout.head, layout.spine, eps, out);
  for (const [what, p] of drawnPoints(layout)) {
    if (!inside(p, layout.bounds, eps)) {
      out.push(
        `${what} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) is outside ${printed(layout.bounds)}`
      );
    }
  }
  return out;
}

function alternating(model: IshikawaModel, layout: IshikawaLayout, out: string[]): void {
  const causes = causesOf(layout);
  if (model.effect === undefined && (layout.head || layout.spine || causes.length > 0)) {
    out.push('a layout with no effect draws something');
  }
  if (model.effect !== undefined && !(layout.head && layout.spine)) {
    out.push('the effect has no head or no spine');
  }
  if (causes.length !== model.causes.length) {
    out.push(`${causes.length} causes laid out for ${model.causes.length}`);
  }
  causes.forEach((c, i) => {
    const want = sideOf(i);
    if (c.index !== i || c.ast !== model.causes[i]?.ast) out.push(`cause ${i} is out of order`);
    if (c.side !== want) out.push(`cause ${i} is ${c.side}, not ${want}`);
    const above = c.bone.y2 < layout.spineY;
    if (above !== (want === 'upper')) out.push(`cause ${i}'s bone ends on the wrong side`);
  });
}

/** How far `p` is along `s` (0 at its start, 1 at its end) and how far off its line. */
function along(p: Point, s: Segment): { t: number; off: number } {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { t: 0, off: Math.hypot(p.x - s.x1, p.y - s.y1) };
  const t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2;
  return { t, off: Math.abs((p.x - s.x1) * dy - (p.y - s.y1) * dx) / Math.sqrt(len2) };
}

/** `p` lies on segment `s`, within `eps`. */
function onSegment(p: Point, s: Segment, eps: number): boolean {
  const { t, off } = along(p, s);
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  return off <= eps && t * len >= -eps && (t - 1) * len <= eps;
}

/** `y` strictly between the ends of `s` in y. */
const betweenY = (y: number, s: Segment, eps: number): boolean =>
  y > Math.min(s.y1, s.y2) + eps && y < Math.max(s.y1, s.y2) - eps;

function bonesOnParents(layout: IshikawaLayout, spine: Segment, eps: number, out: string[]): void {
  for (const c of causesOf(layout)) {
    const [start] = ends(c.bone);
    if (!onSegment(start, spine, eps))
      out.push(`cause ${c.ast}'s bone does not start on the spine`);
    const bones = new Map<string, IshikawaBone>([[c.ast, c.bone]]);
    for (const s of c.subCauses) {
      bones.set(s.ast, s.bone);
      const parent = bones.get(s.parent);
      if (parent === undefined) {
        out.push(`${s.ast} hangs from ${s.parent}, which is not drawn before it`);
        continue;
      }
      if (!onSegment(ends(s.bone)[0], parent, eps)) {
        out.push(`${s.ast}'s bone does not start on ${s.parent}'s`);
      }
      if (!betweenY(s.bone.y2, c.bone, eps)) out.push(`${s.ast}'s slot is outside ${c.ast}'s bone`);
      if (parent.y1 !== parent.y2 && !betweenY(s.bone.y2, parent, eps)) {
        out.push(`${s.ast}'s slot is outside ${s.parent}'s bone`);
      }
    }
  }
}

/**
 * `r` overlaps the head: the region between its back (`x = head.x`) and its quadratic, which is
 * the parabola `x − head.x = (control − head.x) / 2 × (1 − (2 (y − head.y) / h)²)`.
 */
function overlapsHead(r: Rect, head: IshikawaHead, eps: number): boolean {
  const half = head.height / 2;
  const y0 = Math.max(r.y, head.y - half);
  const y1 = Math.min(r.y + r.height, head.y + half);
  if (y1 - y0 <= eps) return false;
  const nearest = Math.min(Math.max(head.y, y0), y1);
  const u = (nearest - head.y) / half;
  const reach = ((head.control.x - head.x) / 2) * (1 - u * u);
  return r.x + r.width > head.x + eps && r.x < head.x + reach - eps;
}

function boxesClear(
  layout: IshikawaLayout,
  head: IshikawaHead,
  spine: Segment & { readonly stroke: number },
  eps: number,
  out: string[]
): void {
  // The spine as drawn; a box only touching its centre line from one side clears it.
  const band = grown(segmentBox(spine), spine.stroke / 2);
  for (const c of causesOf(layout)) {
    if (overlapsHead(c.box, head, eps)) {
      out.push(`${c.ast}'s box ${printed(c.box)} overlaps the head`);
    }
    const crosses = c.box.y < spine.y1 - eps && c.box.y + c.box.height > spine.y1 + eps;
    if (crosses && overlaps(c.box, band, eps)) {
      out.push(`${c.ast}'s box ${printed(c.box)} overlaps the spine`);
    }
  }
}

/** Every point of what is drawn, strokes left out: ends, corners, the head's reach. */
function* drawnPoints(layout: IshikawaLayout): Generator<[string, Point]> {
  if (layout.spine) for (const p of ends(layout.spine)) yield ['the spine', p];
  const { head } = layout;
  if (head) {
    // The quadratic's farthest point is halfway between the back and the control point.
    for (const p of [head.top, head.bottom, { x: (head.x + head.control.x) / 2, y: head.y }]) {
      yield ['the head', p];
    }
    for (const p of corners(head.label)) yield ['the head label', p];
  }
  const bone = function* (what: string, b: IshikawaBone): Generator<[string, Point]> {
    for (const p of [...ends(b), b.arrow.tip, b.arrow.left, b.arrow.right]) yield [what, p];
  };
  for (const c of causesOf(layout)) {
    yield* bone(`${c.ast}'s bone`, c.bone);
    for (const p of [...corners(c.box), ...corners(c.label)]) yield [`${c.ast}'s label`, p];
    for (const s of c.subCauses) {
      yield* bone(`${s.ast}'s bone`, s.bone);
      for (const p of corners(s.label)) yield [`${s.ast}'s label`, p];
    }
  }
}

/**
 * The label overlaps of `layout`, reported and not asserted (spec #519 §Testing): cause boxes and
 * sub-cause labels of different causes or sub-causes that overlap by more than a px² sliver.
 */
export function ishikawaLabelOverlaps(layout: IshikawaLayout): string[] {
  const boxes: [string, Rect][] = [];
  for (const c of causesOf(layout)) {
    boxes.push([c.ast, c.box]);
    for (const s of c.subCauses) boxes.push([s.ast, s.label]);
  }
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, ra] = boxes[i]!;
      const [b, rb] = boxes[j]!;
      if (overlaps(ra, rb, EPS)) out.push(`${a} and ${b}`);
    }
  }
  return out;
}
