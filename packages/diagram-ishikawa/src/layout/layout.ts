// cspell:ignore lerp
/**
 * The ishikawa custom layout (spec #519, `layoutKind: 'custom'`, D491): `IshikawaModel` in,
 * `IshikawaLayout` out. It follows v12's `ishikawaRenderer.ts` with the drawing taken out; the
 * numbers are the metrics table's (`metrics.ts`, pitfall 13):
 *
 * - the head at `(0, spineY)`, facing right, sized by its label (`headMin*`, `headPad*`,
 *   `headLines`), its curve's control point `headControl × w` out;
 * - causes alternate, even indices above the spine and odd below (`side.ts`); the two sides share
 *   `sidePool` by descendant count (at least `sideMin`, and at least
 *   `max descendants × slotFactor × fontSize`), both `spineBase` when every cause is a leaf;
 *   `spineY = max(upper side, spineBase)`;
 * - pairs share a start on the spine, the first at `firstPairX`, each next one at the leftmost
 *   text x of the previous pair; the spine runs from the last one to the head;
 * - a cause's bone is at `angle` and its side's length, `leafFactor` of it for a leaf; its label
 *   is centred `labelOffset` past the end, in a box `boxPadX` by `boxPadY` larger;
 * - sub-causes take slots evenly spaced along the cause's bone (`flattenTree`): even depths are
 *   horizontal bones (`boneBase + bonePerChild × children`, `boneStub` for a leaf) with
 *   end-anchored labels; odd depths are diagonals parallel to the cause's bone, labels above
 *   (`up`) or below (`down`) their end.
 *
 * Fixed on the way (GAPS #582): a pair whose cause box would reach over the head starts further
 * left, by the overlap, and a cause's bone is long enough that its box clears the spine (v12 drew
 * both boxes over them). {@link layoutIshikawaUnfixed} turns both off, for the parity spec.
 *
 * Every text is measured first through the injected measurer (never `getBBox`) and laid out by
 * core's label layout (D225): the effect at `headFontSize` and `headWeight`, causes and
 * sub-causes at the theme's `fontSize` (D493). The effect wraps at `effectWrap` scaled by the
 * size it is drawn at, sub-causes at `subCauseWrap` scaled by the theme's `fontSize`, both over
 * `wrapReferenceSize`; cause labels break only at `<br>` (D495, GAPS #582). The bounds cover
 * everything drawn, strokes included, plus `diagramPadding` (D224).
 */
import type { RenderContext } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { ishikawaLayoutConfig } from '../config.ts';
import {
  causeCount,
  sideOf,
  type IshikawaCause,
  type IshikawaModel,
  type IshikawaSide,
} from '../model.ts';
import { boxUnion, pointsBox, quadBox, segmentBox } from './geometry.ts';
import { growRect } from '@mermaid-js/shared/layout';
import { ISHIKAWA_METRICS as m } from './metrics.ts';
import { horizontal, sign } from './side.ts';
import type {
  IshikawaArrow,
  IshikawaBone,
  IshikawaCauseLayout,
  IshikawaHead,
  IshikawaLabelKind,
  IshikawaLayout,
  IshikawaPairLayout,
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
  return layout(model, ctx, true);
}

/**
 * {@link layoutIshikawa} with both overlap fixes off: v12's geometry, label boxes over the head
 * and across the spine included. For the v12 parity spec only (`./testing`).
 */
export function layoutIshikawaUnfixed(
  model: IshikawaModel,
  ctx: IshikawaLayoutContext
): IshikawaLayout {
  return layout(model, ctx, false);
}

function layout(model: IshikawaModel, ctx: IshikawaLayoutContext, fix: boolean): IshikawaLayout {
  const { diagramPadding: padding } = ishikawaLayoutConfig(
    ctx.config.ishikawa as Readonly<Record<string, unknown>> | undefined
  );
  const family = ctx.theme.value('fontFamily');
  const fontSize = ctx.theme.number('fontSize');
  const fonts = {
    head: { family, size: m.headFontSize, weight: m.headWeight },
    label: { family, size: fontSize, weight: m.labelWeight },
  };
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  // v12's word wrap never split a word: keep one wider than the width whole.
  const measure: Measure = (text, font, maxWidth) =>
    layoutLabel(text, font, maxWidth, ctx.measurer, { ...inline, keepWords: true });

  const { effect, causes } = model;
  if (effect === undefined) {
    // v12 drew nothing at all for an empty body.
    return {
      spineY: m.spineBase,
      pairs: [],
      sides: { upper: m.spineBase, lower: m.spineBase },
      fonts,
      padding,
      bounds: growRect(boxUnion([]), padding),
    };
  }

  const sides = sideLengths(causes, fontSize);
  const spineY = Math.max(sides.upper, m.spineBase);
  // The effect wraps by the size it is drawn at, the same in every theme (GAPS #582).
  const headWrap = (m.effectWrap * m.headFontSize) / m.wrapReferenceSize;
  const head = placeHead(effect.ast, measure(effect.text, fonts.head, headWrap), spineY);

  const subLabels: SubLabels = {
    font: fonts.label,
    wrap: (m.subCauseWrap * fontSize) / m.wrapReferenceSize,
    measure,
  };
  const pairs: IshikawaPairLayout[] = [];
  let spineX = causes.length > 0 ? m.firstPairX : 0;
  for (let p = 0; p * 2 < causes.length; p++) {
    // Each cause's bone and label first: the pair may start further left, off the head.
    const members = [p * 2, p * 2 + 1].flatMap((index): Member[] => {
      const cause = causes[index];
      if (cause === undefined) return [];
      const side = sideOf(index);
      const text = measure(cause.text, fonts.label, Infinity);
      const start = { x: spineX, y: spineY };
      return [{ cause, index, side, ...causeBone(cause, side, sides[side], text, start, fix) }];
    });
    const over = fix ? overHead(members, head) : 0;
    const laid = members.map((member) => placeCause(shifted(member, -over), subLabels));
    spineX -= over;
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
    bounds: growRect(boxUnion(drawnBoxes(drawing)), padding),
  };
}

/**
 * Each side's length (v12 `sideStats`): with any descendants, `sidePool` shared by descendant
 * count, at least `sideMin`; else `spineBase` each. Then at least `max × slotFactor × fontSize`.
 */
function sideLengths(
  causes: readonly IshikawaCause[],
  fontSize: number
): Record<IshikawaSide, number> {
  const stats = { upper: { total: 0, max: 0 }, lower: { total: 0, max: 0 } };
  causes.forEach((cause, i) => {
    const side = stats[sideOf(i)];
    const n = causeCount(cause.causes);
    side.total += n;
    side.max = Math.max(side.max, n);
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

/** v12's arrow marker as a triangle: its tip at the bone's start, `arrowSize × stroke` long and wide. */
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

/** A cause's bone from `start` and its boxed label. */
interface CauseBone {
  readonly seg: Segment;
  /** The bone's reach in y, signed. */
  readonly dy: number;
  readonly label: PlacedLabel;
  readonly box: Rect;
}

/** A cause of a pair, with its bone and label. */
interface Member extends CauseBone {
  readonly cause: IshikawaCause;
  readonly index: number;
  readonly side: IshikawaSide;
}

/**
 * A cause's bone from `start` and its boxed label. With `fix`, the bone is long enough that the
 * box clears the spine (v12 drew a tall label on a short bone across it).
 */
function causeBone(
  cause: IshikawaCause,
  side: IshikawaSide,
  length: number,
  text: MeasuredLabel,
  start: Point,
  fix: boolean
): CauseBone {
  const dir = sign(side);
  const v12Len = length * (cause.causes.length > 0 ? 1 : m.leafFactor);
  const clear = (text.height / 2 + m.boxPadY - m.labelOffset) / SIN;
  const lineLen = fix ? Math.max(v12Len, clear) : v12Len;
  const dy = SIN * lineLen * dir;
  const seg = { x1: start.x, y1: start.y, x2: start.x - COS * lineLen, y2: start.y + dy };
  const label = placeLabel(text, 'cause', { x: seg.x2, y: seg.y2 + m.labelOffset * dir });
  const box: Rect = {
    x: label.x - m.boxPadX,
    y: label.y - m.boxPadY,
    width: label.width + 2 * m.boxPadX,
    height: label.height + 2 * m.boxPadY,
  };
  return { seg, dy, label, box };
}

/**
 * How far the pair's cause boxes reach over the head's back on the head's rows; 0 when they
 * clear it. v12 started every first pair at `firstPairX` and so drew a short leaf cause's box
 * over the head; the pair now starts that much further left (GAPS #582).
 */
function overHead(members: readonly Member[], head: IshikawaHead): number {
  let over = 0;
  for (const { box } of members) {
    if (box.y < head.bottom.y && box.y + box.height > head.top.y) {
      over = Math.max(over, box.x + box.width - head.x);
    }
  }
  return over;
}

/** `member` moved `dx` in x. */
function shifted(member: Member, dx: number): Member {
  if (dx === 0) return member;
  const { seg, label, box } = member;
  return {
    ...member,
    seg: { ...seg, x1: seg.x1 + dx, x2: seg.x2 + dx },
    label: { ...label, x: label.x + dx, anchor: { ...label.anchor, x: label.anchor.x + dx } },
    box: { ...box, x: box.x + dx },
  };
}

/** A cause's descendant, in v12's `flattenTree` order. */
interface Entry {
  readonly cause: IshikawaCause;
  readonly depth: number;
  /** The index of the entry it hangs from; undefined when it hangs from the cause itself. */
  readonly parent: number | undefined;
  readonly parentAst: IshikawaCause['ast'];
}

/**
 * v12 `flattenTree`: one entry per descendant (depth from 2), each sibling list reversed on the
 * upper side, and each entry's slot along the cause's bone: even depths pre-order (nearer the
 * spine than their children), odd depths post-order (after their children, inside their parent's
 * wedge).
 */
function flatten(cause: IshikawaCause, side: IshikawaSide): { entries: Entry[]; slots: number[] } {
  const entries: Entry[] = [];
  const slots: number[] = [];
  let next = 0;
  const ordered = (nodes: readonly IshikawaCause[]): readonly IshikawaCause[] =>
    side === 'upper' ? [...nodes].reverse() : nodes;
  // v12's recursive walk as a loop (chains run deep): a frame is a sibling list, and the odd
  // entry that owns it takes its slot once the list is done.
  interface SiblingList {
    readonly nodes: readonly IshikawaCause[];
    at: number;
    readonly owner: number | undefined;
    readonly ownerAst: Entry['parentAst'];
    readonly depth: number;
  }
  const stack: SiblingList[] = [
    { nodes: ordered(cause.causes), at: 0, owner: undefined, ownerAst: cause.ast, depth: 2 },
  ];
  while (stack.length > 0) {
    const list = stack[stack.length - 1]!;
    const child = list.nodes[list.at++];
    if (child === undefined) {
      stack.pop();
      // The owner is at the depth above: odd when this list is even.
      if (horizontal(list.depth) && list.owner !== undefined) slots[list.owner] = next++;
      continue;
    }
    const index = entries.length;
    entries.push({ cause: child, depth: list.depth, parent: list.owner, parentAst: list.ownerAst });
    const flat = horizontal(list.depth);
    if (flat) slots[index] = next++;
    if (child.causes.length > 0) {
      stack.push({
        nodes: ordered(child.causes),
        at: 0,
        owner: index,
        ownerAst: child.ast,
        depth: list.depth + 1,
      });
    } else if (!flat) slots[index] = next++;
  }
  return { entries, slots };
}

/** A bone sub-causes hang from, and how many of its odd-depth children are placed. */
interface ParentBone {
  readonly seg: Segment;
  readonly childCount: number;
  placed: number;
}

/** How sub-cause labels are measured. */
interface SubLabels {
  readonly font: FontKey;
  readonly wrap: number;
  readonly measure: Measure;
}

/** A cause's bone, its boxed label, and its sub-causes (v12 `drawBranch`). */
function placeCause(member: Member, labels: SubLabels): IshikawaCauseLayout {
  const { cause, index, side, seg, dy, label, box } = member;
  const dir = sign(side);
  const { entries, slots } = flatten(cause, side);
  const slotY = (slot: number): number => seg.y1 + dy * ((slot + 1) / (entries.length + 1));

  const causeParent: ParentBone = { seg, childCount: cause.causes.length, placed: 0 };
  const parents = new Map<number, ParentBone>();
  const oddKind = side === 'upper' ? 'up' : 'down';
  const subCauses = entries.map((entry, i): IshikawaSubCauseLayout => {
    const slot = slots[i]!;
    const y = slotY(slot);
    const parent = entry.parent === undefined ? causeParent : parents.get(entry.parent)!;
    const from = parent.seg;
    const childCount = entry.cause.causes.length;
    let sub: Segment;
    let kind: IshikawaSubCauseLayout['kind'];
    if (horizontal(entry.depth)) {
      // On the parent's diagonal at the slot's y, reaching left.
      const reachY = from.y2 - from.y1;
      const x0 = lerp(from.x1, from.x2, reachY !== 0 ? (y - from.y1) / reachY : 1 / 2);
      const len = childCount > 0 ? m.boneBase + childCount * m.bonePerChild : m.boneStub;
      sub = { x1: x0, y1: y, x2: x0 - len, y2: y };
      kind = 'align';
    } else {
      // From evenly spaced points on the parent's horizontal, parallel to the cause's bone.
      const nth = parent.placed++;
      const x0 = lerp(from.x1, from.x2, (parent.childCount - nth) / (parent.childCount + 1));
      sub = { x1: x0, y1: from.y1, x2: x0 - COS * ((y - from.y1) / (SIN * dir)), y2: y };
      kind = oddKind;
    }
    if (childCount > 0) parents.set(i, { seg: sub, childCount, placed: 0 });
    const text = labels.measure(entry.cause.text, labels.font, labels.wrap);
    return {
      ast: entry.cause.ast,
      parent: entry.parentAst,
      depth: entry.depth,
      kind,
      slot,
      bone: bone(sub, entry.depth, side, m.subBoneStroke),
      label: placeLabel(text, kind, { x: sub.x2, y }),
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
function drawnBoxes(drawing: {
  readonly spine: Segment & { readonly stroke: number };
  readonly head: IshikawaHead;
  readonly pairs: readonly IshikawaPairLayout[];
}): Rect[] {
  const { spine, head, pairs } = drawing;
  const out: Rect[] = [growRect(segmentBox(spine), spine.stroke / 2)];
  out.push(growRect(quadBox(head.bottom, head.control, head.top), head.stroke / 2), head.label);
  const boneBoxes = (b: IshikawaBone): Rect[] => [
    growRect(segmentBox(b), b.stroke / 2),
    pointsBox([b.arrow.tip, b.arrow.left, b.arrow.right]),
  ];
  for (const pair of pairs) {
    for (const c of pair.causes) {
      out.push(...boneBoxes(c.bone), growRect(c.box, c.boxStroke / 2), c.label);
      for (const s of c.subCauses) out.push(...boneBoxes(s.bone), s.label);
    }
  }
  return out;
}
