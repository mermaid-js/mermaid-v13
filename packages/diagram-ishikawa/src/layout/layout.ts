// cspell:ignore lerp
/**
 * The ishikawa custom layout (spec #519 T3, `layoutKind: 'custom'`, D491): `IshikawaModel` in,
 * `IshikawaLayout` out. It follows v12's `ishikawaRenderer.ts` with the drawing taken out:
 *
 * - the head at `(0, spineY)`, facing right, `w = max(60, text width + 6)`,
 *   `h = max(40, 2 × text height + 40)`;
 * - causes alternate, even indices above the spine and odd below; the two sides share a pool of
 *   500 px by descendant count (at least 75 px, and at least `max descendants × 2 × fontSize`),
 *   both 250 when every cause is a leaf; `spineY = max(upper side, 250)`;
 * - pairs share a start on the spine, the first at x = −20, each next one at the leftmost text x
 *   of the previous pair; the spine runs from the last one to the head;
 * - a cause's bone is at 82° and its side's length, or 0.2 of it for a leaf; its label is centred
 *   11 px past the end, in a box ± 20 by ± 2;
 * - sub-causes take slots evenly spaced along the cause's bone (`flattenTree`): even depths are
 *   horizontal bones `60 + 5 × children` long (30 for a leaf), end-anchored labels; odd depths
 *   are diagonals parallel to the cause's bone, labels above (`up`) or below (`down`) their end.
 *
 * Fixed on the way (GAPS #582): a pair whose cause box would reach over the head starts further
 * left, by the overlap, and a cause's bone is long enough that its box clears the spine (v12 drew
 * both boxes over them).
 *
 * Every text is measured first through the injected measurer (never `getBBox`) and laid out by
 * core's label layout (D225): the effect at 14 px weight 600, causes and sub-causes at the
 * theme's `fontSize` (D493); the effect wraps at 110 px and sub-causes at 144 px, both scaled
 * by `fontSize / 16`, cause labels only at `<br>` (D495). Lengths come from the metrics table
 * (pitfall 13); the bounds cover everything drawn, strokes included, plus `diagramPadding`
 * (D224).
 */
import type { RenderContext } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { ishikawaLayoutConfig } from '../config.ts';
import type { IshikawaCause, IshikawaModel } from '../model.ts';
import { boxUnion, grown, pointsBox, quadBox, segmentBox } from './geometry.ts';
import { ISHIKAWA_METRICS as m } from './metrics.ts';
import type {
  IshikawaArrow,
  IshikawaBone,
  IshikawaCauseLayout,
  IshikawaHead,
  IshikawaLabelKind,
  IshikawaLayout,
  IshikawaPairLayout,
  IshikawaSide,
  IshikawaSubCauseLayout,
  PlacedLabel,
  Point,
  Rect,
  Segment,
} from './types.ts';

/** What the layout reads from the render context. */
export type IshikawaLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline'>>;

/** Measures `text` in `font`, wrapped at `maxWidth` (`Infinity`: only at `<br>`). */
type Measure = (text: string, font: FontKey, maxWidth: number) => MeasuredLabel;

const COS = Math.cos(m.angle);
const SIN = Math.sin(m.angle);

/** Lays out an ishikawa diagram in px. */
export function layoutIshikawa(model: IshikawaModel, ctx: IshikawaLayoutContext): IshikawaLayout {
  const { diagramPadding: padding } = ishikawaLayoutConfig(
    ctx.config.ishikawa as Readonly<Record<string, unknown>> | undefined
  );
  const family = ctx.theme.value('fontFamily');
  const fontSize = ctx.theme.number('fontSize');
  const fonts = {
    head: { family, size: m.headFontSize, weight: m.headWeight },
    label: { family, size: fontSize, weight: m.labelWeight },
  };
  const scale = fontSize / m.wrapReferenceSize;
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  // v12's word wrap never split a word: keep one wider than the width whole.
  const measure: Measure = (text, font, maxWidth) =>
    layoutLabel(text, font, maxWidth, ctx.measurer, { ...inline, keepWords: true });

  const { effect, causes } = model;
  if (effect === undefined) {
    // v12 drew nothing at all for an empty body.
    const sides = { upper: m.spineBase, lower: m.spineBase };
    return {
      spineY: m.spineBase,
      pairs: [],
      sides,
      fonts,
      padding,
      bounds: grown(boxUnion([]), padding),
    };
  }

  const sides = sideLengths(causes, fontSize);
  const spineY = Math.max(sides.upper, m.spineBase);
  const head = placeHead(
    effect.ast,
    measure(effect.text, fonts.head, m.effectWrap * scale),
    spineY
  );

  const pairs: IshikawaPairLayout[] = [];
  let spineX = causes.length > 0 ? m.firstPairX : 0;
  const draw = { font: fonts.label, subWrap: m.subCauseWrap * scale, measure };
  for (let p = 0; p * 2 < causes.length; p++) {
    // Measure first, then place: the start may move left off the head (`overHead`).
    const members = [p * 2, p * 2 + 1].flatMap((index): Member[] => {
      const cause = causes[index];
      if (cause === undefined) return [];
      const side: IshikawaSide = index % 2 === 0 ? 'upper' : 'lower';
      const text = measure(cause.text, fonts.label, Infinity);
      return [{ cause, index, side, length: sides[side], text }];
    });
    const at = (x: number): Point => ({ x, y: spineY });
    spineX -= overHead(
      members.map((mb) => causeBone(mb, at(spineX)).box),
      head
    );
    const laid = members.map((mb) => placeCause(mb, at(spineX), draw));
    pairs.push({ x: spineX, causes: laid });
    let left = Infinity;
    for (const c of laid) {
      left = Math.min(left, c.label.x);
      for (const s of c.subCauses) left = Math.min(left, s.label.x);
    }
    spineX = left;
  }

  const spine = { x1: spineX, y1: spineY, x2: 0, y2: spineY, stroke: m.boneStroke };
  const drawing = { spine, head, pairs };
  return {
    spineY,
    ...drawing,
    sides,
    fonts,
    padding,
    bounds: grown(boxUnion(drawnBoxes(drawing)), padding),
  };
}

/**
 * How far the pair's cause boxes reach over the head's back (`x = 0`) on the head's rows; 0 when
 * they clear it. Fixed on the way: v12 started every first pair at −20 and so drew a short leaf
 * cause's box over the head; the pair now starts that much further left (GAPS #582).
 */
function overHead(boxes: readonly Rect[], head: IshikawaHead): number {
  let over = 0;
  for (const box of boxes) {
    if (box.y < head.bottom.y && box.y + box.height > head.top.y) {
      over = Math.max(over, box.x + box.width - head.x);
    }
  }
  return over;
}

/** The number of causes below `cause`, at any depth (a loop: chains run deep). */
function descendants(cause: IshikawaCause): number {
  let n = 0;
  const stack: IshikawaCause[] = [cause];
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    n += c.causes.length;
    stack.push(...c.causes);
  }
  return n;
}

/**
 * Each side's length (v12 `sideStats`): with any descendants, the 500 px pool shared by
 * descendant count, at least 75; else 250 each. Then at least `max × 2 × fontSize`.
 */
function sideLengths(
  causes: readonly IshikawaCause[],
  fontSize: number
): { upper: number; lower: number } {
  const stats = { upper: { total: 0, max: 0 }, lower: { total: 0, max: 0 } };
  causes.forEach((cause, i) => {
    const s = i % 2 === 0 ? stats.upper : stats.lower;
    const d = descendants(cause);
    s.total += d;
    s.max = Math.max(s.max, d);
  });
  const total = stats.upper.total + stats.lower.total;
  const share = (n: number): number =>
    total > 0 ? Math.max(m.sideMin, m.sidePool * (n / total)) : m.spineBase;
  const slot = m.slotFactor * fontSize;
  return {
    upper: Math.max(share(stats.upper.total), stats.upper.max * slot),
    lower: Math.max(share(stats.lower.total), stats.lower.max * slot),
  };
}

/** The head at `(0, spineY)` and its label (v12 `drawHead`). */
function placeHead(ast: IshikawaHead['ast'], text: MeasuredLabel, spineY: number): IshikawaHead {
  const width = Math.max(m.headMinWidth, text.width + m.headPadX);
  const height = Math.max(m.headMinHeight, text.height * m.headLines + m.headPadY);
  return {
    ast,
    x: 0,
    y: spineY,
    width,
    height,
    top: { x: 0, y: spineY - height / 2 },
    bottom: { x: 0, y: spineY + height / 2 },
    control: { x: width * m.headControl, y: spineY },
    stroke: m.outlineStroke,
    label: {
      x: (width - text.width) / 2 + m.headTextNudge,
      y: spineY - text.height / 2,
      width: text.width,
      height: text.height,
      text,
      anchor: { x: width / 2 + m.headTextNudge, y: spineY },
    },
  };
}

/** A label of `kind` placed by its text point `anchor`, as v12's text attributes placed it. */
function placeLabel(text: MeasuredLabel, kind: IshikawaLabelKind, anchor: Point): PlacedLabel {
  const { width, height } = text;
  // v12 moved a label's first line up by half its extra lines.
  const extra = Math.max(0, height - text.lineHeight) / 2;
  let x = anchor.x - width;
  let y = anchor.y - height / 2;
  if (kind === 'cause') x = anchor.x - width / 2;
  else if (kind === 'up') y = anchor.y - extra - text.baseline;
  else if (kind === 'down') y = anchor.y - extra;
  return { x, y, width, height, text, anchor };
}

/** v12's arrow marker as a triangle: its tip at the bone's start, `size` long and wide. */
function arrowOf(s: Segment, stroke: number): IshikawaArrow {
  const tip = { x: s.x1, y: s.y1 };
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  if (len === 0) return { tip, left: tip, right: tip };
  const size = m.arrowSize * stroke;
  const ux = (s.x2 - s.x1) / len;
  const uy = (s.y2 - s.y1) / len;
  const base = { x: tip.x + ux * size, y: tip.y + uy * size };
  const px = (-uy * size) / 2;
  const py = (ux * size) / 2;
  return {
    tip,
    left: { x: base.x + px, y: base.y + py },
    right: { x: base.x - px, y: base.y - py },
  };
}

function bone(s: Segment, depth: number, side: IshikawaSide, stroke: number): IshikawaBone {
  return { ...s, depth, side, stroke, arrow: arrowOf(s, stroke) };
}

/** A cause's descendant, in v12's `flattenTree` order. */
interface Entry {
  readonly cause: IshikawaCause;
  readonly depth: number;
  /** The entry it hangs from; −1 for the cause itself. */
  readonly parent: number;
  readonly parentAst: IshikawaCause['ast'];
}

/**
 * v12 `flattenTree`: one entry per descendant (depth from 2), each sibling list reversed on the
 * upper side, and the slot order along the cause's bone: even depths pre-order (nearer the
 * spine than their children), odd depths post-order (after their children, inside their parent's
 * wedge).
 */
function flatten(cause: IshikawaCause, side: IshikawaSide): { entries: Entry[]; order: number[] } {
  const entries: Entry[] = [];
  const order: number[] = [];
  const ordered = (nodes: readonly IshikawaCause[]): readonly IshikawaCause[] =>
    side === 'upper' ? [...nodes].reverse() : nodes;
  // v12's recursive walk as a loop (chains run deep): a frame is a sibling list, and the odd
  // entry that owns it takes its slot once the list is done.
  interface Frame {
    readonly nodes: readonly IshikawaCause[];
    i: number;
    readonly parent: number;
    readonly parentAst: Entry['parentAst'];
    readonly depth: number;
  }
  const stack: Frame[] = [
    { nodes: ordered(cause.causes), i: 0, parent: -1, parentAst: cause.ast, depth: 2 },
  ];
  while (stack.length > 0) {
    const f = stack[stack.length - 1]!;
    const child = f.nodes[f.i++];
    if (child === undefined) {
      stack.pop();
      if (f.depth % 2 === 0 && f.parent >= 0) order.push(f.parent);
      continue;
    }
    const idx = entries.length;
    entries.push({ cause: child, depth: f.depth, parent: f.parent, parentAst: f.parentAst });
    const odd = f.depth % 2 !== 0;
    if (!odd) order.push(idx);
    if (child.causes.length > 0) {
      stack.push({
        nodes: ordered(child.causes),
        i: 0,
        parent: idx,
        parentAst: child.ast,
        depth: f.depth + 1,
      });
    } else if (odd) order.push(idx);
  }
  return { entries, order };
}

/** A bone sub-causes hang from, and how many of its odd-depth children are placed. */
interface Parent {
  readonly seg: Segment;
  readonly childCount: number;
  drawn: number;
}

/** What placing a cause needs besides the cause. */
interface CauseDraw {
  readonly font: FontKey;
  readonly subWrap: number;
  readonly measure: Measure;
}

/** A cause of a pair, its label measured. */
interface Member {
  readonly cause: IshikawaCause;
  readonly index: number;
  readonly side: IshikawaSide;
  /** Its side's length. */
  readonly length: number;
  readonly text: MeasuredLabel;
}

/** A cause's bone from `start` and its boxed label. */
function causeBone(
  { cause, side, length, text }: Member,
  start: Point
): { seg: Segment; dy: number; label: PlacedLabel; box: Rect } {
  const dir = side === 'upper' ? -1 : 1;
  // Fixed on the way: long enough that the label's box clears the spine (v12 drew a tall label
  // on a short bone across it).
  const clear = (text.height / 2 + m.boxPadY - m.labelOffset) / SIN;
  const lineLen = Math.max(length * (cause.causes.length > 0 ? 1 : m.leafFactor), clear);
  const dx = -COS * lineLen;
  const dy = SIN * lineLen * dir;
  const seg = { x1: start.x, y1: start.y, x2: start.x + dx, y2: start.y + dy };
  const label = placeLabel(text, 'cause', { x: seg.x2, y: seg.y2 + m.labelOffset * dir });
  const box: Rect = {
    x: label.x - m.boxPadX,
    y: label.y - m.boxPadY,
    width: label.width + 2 * m.boxPadX,
    height: label.height + 2 * m.boxPadY,
  };
  return { seg, dy, label, box };
}

/** A cause's bone from `start`, its boxed label, and its sub-causes (v12 `drawBranch`). */
function placeCause(
  member: Member,
  start: Point,
  { font, subWrap, measure }: CauseDraw
): IshikawaCauseLayout {
  const { cause, index, side } = member;
  const dir = side === 'upper' ? -1 : 1;
  const { seg, dy, label, box } = causeBone(member, start);

  const { entries, order } = flatten(cause, side);
  const ys: number[] = new Array<number>(entries.length).fill(start.y);
  order.forEach((entry, slot) => {
    ys[entry] = start.y + dy * ((slot + 1) / (entries.length + 1));
  });
  const slots: number[] = new Array<number>(entries.length).fill(0);
  order.forEach((entry, slot) => {
    slots[entry] = slot;
  });

  const parents = new Map<number, Parent>([
    [-1, { seg, childCount: cause.causes.length, drawn: 0 }],
  ]);
  const oddKind = side === 'upper' ? 'up' : 'down';
  const subCauses = entries.map((e, i): IshikawaSubCauseLayout => {
    const y = ys[i]!;
    const par = parents.get(e.parent)!;
    const childCount = e.cause.causes.length;
    let sub: Segment;
    let kind: IshikawaSubCauseLayout['kind'];
    if (e.depth % 2 === 0) {
      // Horizontal: on the parent's diagonal at the slot's y, reaching left.
      const dyP = par.seg.y2 - par.seg.y1;
      const x0 = lerp(par.seg.x1, par.seg.x2, dyP !== 0 ? (y - par.seg.y1) / dyP : 1 / 2);
      const len = childCount > 0 ? m.boneBase + childCount * m.bonePerChild : m.boneStub;
      sub = { x1: x0, y1: y, x2: x0 - len, y2: y };
      kind = 'align';
    } else {
      // Diagonal: from evenly spaced points on the parent's horizontal, to the slot's y.
      const k = par.drawn++;
      const x0 = lerp(par.seg.x1, par.seg.x2, (par.childCount - k) / (par.childCount + 1));
      const y0 = par.seg.y1;
      sub = { x1: x0, y1: y0, x2: x0 - COS * ((y - y0) / (SIN * dir)), y2: y };
      kind = oddKind;
    }
    if (childCount > 0) parents.set(i, { seg: sub, childCount, drawn: 0 });
    const subText = measure(e.cause.text, font, subWrap);
    return {
      ast: e.cause.ast,
      parent: e.parentAst,
      depth: e.depth,
      kind,
      slot: slots[i]!,
      bone: bone(sub, e.depth, side, m.subBoneStroke),
      label: placeLabel(subText, kind, { x: sub.x2, y }),
    };
  });

  return {
    ast: cause.ast,
    index,
    side,
    bone: bone(seg, 1, side, m.boneStroke),
    label,
    box,
    boxStroke: m.outlineStroke,
    subCauses,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Every box drawn, strokes included: the bounds are their union (D224). */
function drawnBoxes(d: {
  readonly spine: Segment & { readonly stroke: number };
  readonly head: IshikawaHead;
  readonly pairs: readonly IshikawaPairLayout[];
}): Rect[] {
  const out: Rect[] = [grown(segmentBox(d.spine), d.spine.stroke / 2)];
  const { head } = d;
  out.push(grown(quadBox(head.bottom, head.control, head.top), head.stroke / 2), head.label);
  const boneBoxes = (b: IshikawaBone): Rect[] => [
    grown(segmentBox(b), b.stroke / 2),
    pointsBox([b.arrow.tip, b.arrow.left, b.arrow.right]),
  ];
  for (const pair of d.pairs) {
    for (const c of pair.causes) {
      out.push(...boneBoxes(c.bone), grown(c.box, c.boxStroke / 2), c.label);
      for (const s of c.subCauses) out.push(...boneBoxes(s.bone), s.label);
    }
  }
  return out;
}
