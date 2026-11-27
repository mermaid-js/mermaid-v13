/**
 * Where each C4 relation's label goes (D455, Pele `render.ts` at commit 3a2f075,
 * https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano): measured after routing, then placed
 * along its line where it covers least of what it should keep off.
 */
// cspell:ignore kepano
import { Style } from '@mermaid-js/core/text';
import type { C4LayoutConfig, C4Fonts } from '../config.ts';
import type { C4Model, C4Relation } from '../model.ts';
import type { Measure, Measured } from './layout.ts';
import { C4_METRICS as M } from './metrics.ts';
import type { LabelRoom } from './room.ts';
import type { Place, Stagger } from './pairs.ts';
import { crosses, lineOf, type Route, type Work } from './route.ts';
import { hitRect } from './shapes.ts';
import type { Rect } from './types.ts';

/** A relation's drawn label: C4Dynamic numbers its relations in model order, from 1 (v12). */
export function relationLabelText(
  model: Pick<C4Model, 'c4Type'>,
  rel: C4Relation,
  index: number
): string {
  return (model.c4Type === 'C4Dynamic' ? `${index + 1}: ` : '') + rel.label;
}

/** A relation's `[techn]` line, when it has one. */
export function relationTechnText(rel: Pick<C4Relation, 'techn'>): string | undefined {
  return rel.techn ? `[${rel.techn}]` : undefined;
}

/** What measuring and placing a label reads from the layout. */
export interface LabelSetup {
  readonly model: C4Model;
  readonly config: C4LayoutConfig;
  readonly fonts: C4Fonts;
  readonly measure: Measure;
  /** The room a label's box adds round its texts (`RouteInput.labelRoom`). */
  readonly labelRoom: LabelRoom;
  /** Labels are drawn as edge-label tags (SVG output), not as framed text (`RouteInput.tags`). */
  readonly tags: boolean;
}

/** A relation's label and `[techn]`, measured, and where their box goes. */
export interface LabelSpot {
  readonly label?: Measured;
  readonly techn?: Measured;
  /** The label box's centre and top, and its size (zero without a label). */
  readonly cx: number;
  readonly top: number;
  readonly lw: number;
  readonly lh: number;
  /** No spot kept the label off its arrowheads, the shapes and the headers. */
  readonly crowded?: true;
}

/**
 * What a label should not cover (Pele `render.ts`): shapes but their edges, arrowheads, boundary
 * headers and the labels placed before it, as x0, y0, x1, y1 runs.
 */
export class Taken {
  private readonly boxes: number[] = [];

  constructor(private readonly work: Work) {}

  add(x0: number, y0: number, x1: number, y1: number): void {
    this.boxes.push(x0, y0, x1, y1);
  }

  /** A square of half side `r` about (x, y). */
  around(x: number, y: number, r: number): void {
    this.add(x - r, y - r, x + r, y + r);
  }

  /**
   * A boundary frame's border (D746): its four sides, each a strip `half` either side of the
   * dashed line, so that a label keeps off the border but may sit inside the frame or outside it.
   */
  border({ x, y, width, height }: Rect, half: number): void {
    const [x1, y1] = [x + width, y + height];
    this.add(x - half, y - half, x1 + half, y + half);
    this.add(x - half, y1 - half, x1 + half, y1 + half);
    this.add(x - half, y + half, x + half, y1 - half);
    this.add(x1 - half, y + half, x1 + half, y1 - half);
  }

  /** The area of the box x0, y0, x1, y1 that is taken. */
  covered(x0: number, y0: number, x1: number, y1: number): number {
    const t = this.boxes;
    this.work.charge(t.length / 4);
    let area = 0;
    for (let i = 0; i < t.length; i += 4) {
      const w = Math.min(x1, t[i + 2]!) - Math.max(x0, t[i]!);
      if (w <= 0) continue;
      const h = Math.min(y1, t[i + 3]!) - Math.max(y0, t[i + 1]!);
      if (h > 0) area += w * h;
    }
    return area;
  }
}

/**
 * Every relation's line, so that a label keeps off the others' (#522 final review): the
 * stretches as x0, y0, x1, y1 runs, each with the index of the relation it is part of.
 */
export class Lines {
  private readonly runs: number[] = [];
  private readonly owners: number[] = [];

  constructor(private readonly work: Work) {}

  /** The polyline (x, y pairs) of relation `owner`. */
  add(owner: number, line: readonly number[]): void {
    for (let i = 2; i < line.length; i += 2) {
      this.runs.push(line[i - 2]!, line[i - 1]!, line[i]!, line[i + 1]!);
      this.owners.push(owner);
    }
  }

  /** How many stretches of relations other than `own` clip the box x0, y0, x1, y1 (Liang–Barsky). */
  through(own: number, x0: number, y0: number, x1: number, y1: number): number {
    const t = this.runs;
    this.work.charge(this.owners.length);
    const box = { x0, y0, x1, y1 };
    let count = 0;
    for (let k = 0; k < this.owners.length; k++) {
      if (this.owners[k] === own) continue;
      const i = 4 * k;
      const p = { x: t[i]!, y: t[i + 1]! };
      if (hitRect(box, p, { x: t[i + 2]! - p.x, y: t[i + 3]! - p.y }) <= 1) count++;
    }
    return count;
  }
}

const offset = (v: number | undefined): number =>
  v ? Math.max(-M.maxOffset, Math.min(M.maxOffset, v)) : 0;

/** What placing one relation's label reads. */
export interface LabelInput {
  readonly rel: C4Relation;
  readonly index: number;
  readonly r: Route;
  readonly input: LabelSetup;
  /** What the label should keep off; undefined once the budget is spent. */
  readonly keep: Keep | undefined;
  /** Where its line runs among the others between the same two shapes (`pairPlaces`). */
  readonly place?: Place | undefined;
}

/** What a label keeps off while it is placed. */
export interface Keep {
  /** What it should cover least of: shapes but their edges, arrowheads, headers, labels. */
  readonly taken: Taken;
  /** What it must not cover at all: whole shapes and boundary headers. */
  readonly blocked: Taken;
  /**
   * The boundary frames' borders (D746), which it must not cover either, unless no spot clears
   * them: then a spot clear of all else is taken, marked crowded. None on that second search.
   */
  readonly borders?: Taken;
  /** Its own arrowheads' tips, as x, y pairs: it must not cover their squares either. */
  readonly heads: readonly number[];
  /** Every relation's line; the label should keep off all but its own (`own`, by index in `Lines`). */
  readonly lines: Lines;
  readonly own: number;
  readonly work: Work;
  /** Labels are drawn as tags (`RouteInput.tags`): placed labels block, and on the line comes first. */
  readonly tags: boolean;
}

/** A label box, x0, y0, x1, y1. */
interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A placed label, for the labels after it: one to cover least of, and with tags one never to
 * cover, since a tag is opaque (#955 review).
 */
function keepOff(keep: Keep | undefined, { x0, y0, x1, y1 }: Box): void {
  if (!keep) return;
  keep.taken.add(x0, y0, x1, y1);
  if (keep.tags) keep.blocked.add(x0, y0, x1, y1);
}

/** How much of a label box it must not cover: `blocked`, the frames' borders, its own heads. */
function forbidden(keep: Keep, box: Box): number {
  const [rest, border] = forbiddenParts(keep, box);
  return rest + border;
}

/** {@link forbidden} in two: what is not the frames' borders, and what is. */
function forbiddenParts(keep: Keep, { x0, y0, x1, y1 }: Box): [number, number] {
  const border = keep.borders?.covered(x0, y0, x1, y1) ?? 0;
  let area = keep.blocked.covered(x0, y0, x1, y1);
  const h = keep.heads;
  keep.work.charge(h.length / 2);
  for (let i = 0; i < h.length; i += 2) {
    const w = Math.min(x1, h[i]! + M.arrow) - Math.max(x0, h[i]! - M.arrow);
    const t = Math.min(y1, h[i + 1]! + M.arrow) - Math.max(y0, h[i + 1]! - M.arrow);
    if (w > 0 && t > 0) area += w * t;
  }
  return [area, border];
}

/** A relation's label and `[techn]` measured, and the size of the tag round them. */
export interface MeasuredLabel {
  readonly label: Measured | undefined;
  readonly techn: Measured | undefined;
  readonly lw: number;
  readonly lh: number;
}

const widthOf = (m: Measured | undefined): number => m?.text.width ?? 0;
const heightOf = (m: Measured | undefined): number => m?.text.height ?? 0;

/**
 * A relation's label and `[techn]`, measured as they are drawn: wrapped at `room` (the room its
 * line leaves) when every text wraps; none when it has neither.
 */
export function measureLabel(
  { model, config, fonts, measure, labelRoom }: LabelSetup,
  rel: C4Relation,
  index: number,
  room: number
): MeasuredLabel | undefined {
  const wrap = config.wrapAll ? room : Infinity;
  const label = measure(relationLabelText(model, rel, index), fonts.message, wrap);
  const techn = measure(relationTechnText(rel), fonts.message, wrap, Style.Italic);
  if (!label && !techn) return undefined;
  return {
    label,
    techn,
    lw: Math.max(widthOf(label), widthOf(techn)) + labelRoom.x,
    lh: heightOf(label) + heightOf(techn) + labelRoom.y,
  };
}

/**
 * A relation's label and `[techn]`, measured and placed along its line (Pele `render.ts`): on
 * the line, or beside it when another relation runs the opposite way, moved by the author's
 * offsets; with `taken`, slid to the spot that covers least of it (and added to it). Measured
 * after routing, as Pele does: its wrap width (the route's `room`) depends on the line it sits on.
 */
export function placeLabel({ rel, index, r, input, keep, place }: LabelInput): LabelSpot {
  const measured = measureLabel(input, rel, index, r.room);
  if (!measured) return { cx: r.x0, top: r.y0, lw: 0, lh: 0 };
  const { label, techn, lw, lh } = measured;
  const { at, dx, dy, crowded } = spotOf({ rel, r, lw, lh, keep, place, tags: input.tags });
  const cx = r.x0 + (r.x1 - r.x0) * at + dx;
  const top = r.y0 + (r.y1 - r.y0) * at + dy - lh / 2;
  keepOff(keep, { x0: cx - lw / 2, y0: top, x1: cx + lw / 2, y1: top + lh });
  return {
    ...(label ? { label } : {}),
    ...(techn ? { techn } : {}),
    cx,
    top,
    lw,
    lh,
    ...(crowded ? { crowded: true as const } : {}),
  };
}

/** What finding the spot of a `lw` × `lh` label on its line `r` reads. */
interface SpotInput {
  readonly rel: C4Relation;
  readonly r: Route;
  readonly lw: number;
  readonly lh: number;
  readonly keep: Keep | undefined;
  readonly place: Place | undefined;
  /** Labels are drawn as tags (`LabelSetup.tags`). */
  readonly tags: boolean;
}

/**
 * Where a label goes: beside its line when another runs the opposite way, moved by the author's
 * offsets; with `keep`, a staggered tag at its end of the line when that is clear (D679), else
 * the spot that covers least ({@link clearest}). A tag on one of several lines between two
 * shapes (`place.tagged`) that ends up off its line is crowded (D679): there was no room for it.
 */
function spotOf({ rel, r, lw, lh, keep, place, tags }: SpotInput): Clearest {
  const beside = Math.abs(r.nx) * (lw / 2) + Math.abs(r.ny) * (lh / 2) + M.besideGap;
  const aside = r.lean ? Math.max(0, Math.min(r.lean, beside - M.leanSlack)) : beside;
  const online: [number, number] = [r.nx * aside, r.ny * aside];
  const given: [number, number] = [
    online[0] + offset(rel.offsetX),
    online[1] + offset(rel.offsetY),
  ];
  if (!keep) return { at: M.slide[0]!, dx: given[0], dy: given[1], crowded: false };
  const spot =
    staggeredSpot(r, lw, lh, keep, staggerEnd(rel, place)) ??
    acrossBorders({ r, lw, lh, given, online, keep });
  return crowdedAt(rel, place, r, boxOf(r, spot, lw, lh), tags) ? { ...spot, crowded: true } : spot;
}

/**
 * The clearest spot ({@link clearest}), off the frames' borders (D746), so that a tag slides off
 * a border even where the author's offsets put it. A label does not float far off to clear a
 * border (a line through a gap between two frames narrower than the label, or a short line from
 * a frame's side): when the spot off the borders is crowded, or lies farther from the line, by
 * more than half the label's smaller side, than the spot found with the borders left out, that
 * spot is taken instead, when it clears the rest, and is crowded, for it lies across a border.
 */
function acrossBorders(input: ClearestInput): Clearest {
  const [spot, across] = clearest(input);
  const reach = Math.min(input.lw, input.lh) / 2;
  const off = awayFromLine(input, spot);
  // A clear spot this near its line is kept: no spot can lie nearer by more than `reach`.
  if (!across || (!spot.crowded && off <= reach)) return spot;
  if (across.crowded || sameSpot(spot, across)) return spot;
  const farther = off > awayFromLine(input, across) + reach;
  return spot.crowded || farther ? { ...across, crowded: true } : spot;
}

const sameSpot = (p: Clearest, q: Clearest): boolean =>
  p.at === q.at && p.dx === q.dx && p.dy === q.dy;

/** How far the middle of the label at `spot` lies from its own line. */
function awayFromLine({ r, lw, lh }: ClearestInput, spot: Clearest): number {
  const box = boxOf(r, spot, lw, lh);
  return distanceToLine(r, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
}

/** The end a staggered tag keeps to; none when not staggered or moved by the author's offsets. */
const staggerEnd = (rel: C4Relation, place: Place | undefined): Stagger | undefined =>
  movedByAuthor(rel) ? undefined : place?.stagger;

/** Whether a tag that belongs on its line (`place.tagged`, D679) left it. */
const offItsLine = (place: Place | undefined, r: Route, box: Box): boolean =>
  place?.tagged === true && !onOwnLine(r, box);

/**
 * Whether a tag straddles its own line (D679): the line runs through the tag but not through
 * its middle, so the tag is neither on its line nor beside it. A tag is opaque, so the line
 * seems to end at its border.
 */
const straddles = (r: Route, box: Box): boolean =>
  onOwnLine(r, box) &&
  distanceToLine(r, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2) > M.onLineTolerance;

/** Whether the author moved a relation's label with `UpdateRelStyle` offsets (D455). */
const movedByAuthor = (rel: C4Relation): boolean => Boolean(rel.offsetX) || Boolean(rel.offsetY);

/**
 * Whether a placed tag is crowded: off the line it belongs on, or left straddling its line by
 * the placement. A tag the author moved is where the author put it (D455), never crowded.
 */
const crowdedAt = (
  rel: C4Relation,
  place: Place | undefined,
  r: Route,
  box: Box,
  tags: boolean
): boolean => tags && !movedByAuthor(rel) && (offItsLine(place, r, box) || straddles(r, box));

/** How far (x, y) lies from the nearest stretch of a relation's own line. */
function distanceToLine(r: Route, x: number, y: number): number {
  const line = lineOf(r.points, r.controls);
  let least = Infinity;
  for (let i = 2; i < line.length; i += 2)
    least = Math.min(least, toSegment(x, y, line.slice(i - 2, i + 2)));
  return least;
}

/** How far (x, y) lies from the segment `[px, py, qx, qy]`. */
function toSegment(x: number, y: number, [px, py, qx, qy]: readonly number[]): number {
  const [dx, dy] = [qx! - px!, qy! - py!];
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - px!) * dx + (y - py!) * dy) / len2)) : 0;
  return Math.hypot(x - (px! + t * dx), y - (py! + t * dy));
}

/**
 * How far a tag keeps from each end of its line, from the line's end (D679): the arrowhead's
 * length, then `tagClear` beyond it, as from a shape, and a pixel. A line without an arrowhead
 * at that end keeps the same room, for a neighbouring line's arrowhead may sit level with it.
 */
export const tagEndClear = (): number => M.arrow + M.tagClear + M.tagSlack;

/** The step between two tagged lines side by side: a one-line tag's height and a `besideGap` either side. */
export function tagStepOf({ measure, fonts, labelRoom }: LabelSetup): number {
  const line = measure('X', fonts.message, Infinity);
  return line ? line.text.height + labelRoom.y + 2 * M.besideGap : 0;
}

/**
 * The step a relation's tag needs between its line and the next (D679): its height and a
 * `besideGap` either side, at least `base` (a one-line tag's, {@link tagStepOf}).
 */
export const stepFor = (base: number, measured: MeasuredLabel | undefined): number =>
  Math.max(base, (measured?.lh ?? 0) + 2 * M.besideGap);

/**
 * A staggered tag's spot (D679): on its line, `tagEndClear` from the end it keeps to; none for a
 * tag not staggered or moved by the author's offsets, one too long for its line, or one whose
 * spot is not clear.
 */
function staggeredSpot(
  r: Route,
  lw: number,
  lh: number,
  keep: Keep,
  end: Stagger | undefined
): Clearest | undefined {
  if (!end) return undefined;
  const [dx, dy] = [r.x1 - r.x0, r.y1 - r.y0];
  const len = Math.hypot(dx, dy);
  const t = (tagEndClear() + (Math.abs(dx) * lw + Math.abs(dy) * lh) / len / 2) / len;
  if (!(t <= 1 / 2)) return undefined;
  const spot = { at: end === 'start' ? t : 1 - t, dx: 0, dy: 0, crowded: false };
  return isClear(keep, boxOf(r, spot, lw, lh)) ? spot : undefined;
}

/** The label box at a spot on `r`. */
function boxOf(r: Route, { at, dx, dy }: Clearest, lw: number, lh: number): Box {
  const x = r.x0 + (r.x1 - r.x0) * at + dx;
  const y = r.y0 + (r.y1 - r.y0) * at + dy;
  return { x0: x - lw / 2, y0: y - lh / 2, x1: x + lw / 2, y1: y + lh / 2 };
}

/** Whether a label box covers nothing it should keep off, nor another relation's line. */
function isClear(keep: Keep, box: Box): boolean {
  return (
    forbidden(keep, box) === 0 &&
    keep.taken.covered(box.x0, box.y0, box.x1, box.y1) === 0 &&
    keep.lines.through(keep.own, box.x0, box.y0, box.x1, box.y1) === 0
  );
}

/** Whether a relation's own line runs through its label box. */
const onOwnLine = (r: Route, box: Box): boolean => crosses(lineOf(r.points, r.controls), box);

/** What finding a label's spot reads. */
interface ClearestInput {
  readonly r: Route;
  /** The label box's size. */
  readonly lw: number;
  readonly lh: number;
  /** Its offset from the line's stretch: the author's offsets added, and without them. */
  readonly given: readonly [number, number];
  readonly online: readonly [number, number];
  readonly keep: Keep;
}

/** Where a label goes: `at` along its stretch, `dx`, `dy` off it. */
interface Clearest {
  readonly at: number;
  readonly dx: number;
  readonly dy: number;
  /** No spot was clear: the one taken covers what it should not, or another relation's line. */
  readonly crowded: boolean;
}

/**
 * Where along the line, and how far off it, a `lw` × `lh` label goes. First on the line (the
 * author's offsets, then none; a tag pushed beside its line also tries the line itself), slid to
 * the spot that covers least of `taken` (Pele `render.ts`), each other relation's stretch through
 * it costing `lineCover` of its area; a tag then also tries the finer steps of `fineSlide` on the
 * line, so that one fitting between the shapes stays on it (#955 review); when that spot still
 * costs anything, also beside the line on either side, a label's depth further out at each step. When no spot is clear, the search runs again with finer steps along the line
 * (`fineSlide`) and beside it (`fineSplit` per depth), so a label wider than the gaps the coarse
 * steps try still finds one between them; a label that found a clear spot is not moved. A spot
 * that covers `forbidden` is never taken while another does not; when none clears it, the one
 * that covers least of it is, and the label is crowded, as it is when the spot taken lies over
 * another relation's line.
 *
 * With the frames' borders to keep off, the same search also finds the spot it would find with
 * the borders left out (second), from the same spots: each is tried once, and its cost is
 * counted once.
 */
function clearest(input: ClearestInput): [Clearest, Clearest | undefined] {
  const search = new SpotSearch(input);
  search.run();
  return search.results();
}

/** An offset off the line's stretch, x and y. */
type Offset = readonly [number, number];

const sameOffset = (p: Offset, q: Offset): boolean => p[0] === q[0] && p[1] === q[1];

/**
 * The offsets a label tries on its line: the author's (`given`), then none of them (`online`).
 * Offsets from the diagram are kept unless a spot on the line itself covers less. A tag pushed
 * beside its line (another relation runs the opposite way) also tries the line itself, which
 * lines spaced a tag apart leave clear.
 */
function onLineOffsets(given: Offset, online: Offset, tags: boolean): Offset[] {
  const ons = sameOffset(given, online) ? [given] : [given, online];
  if (tags && !ons.some((p) => sameOffset(p, [0, 0]))) ons.push([0, 0]);
  return ons;
}

/** Where beside its line a label steps out: the unit normal, the first step, one label depth. */
interface BesideFrame {
  readonly nx: number;
  readonly ny: number;
  readonly half: number;
  readonly depth: number;
  /** The author's offsets, which the steps beside the line keep. */
  readonly ax: number;
  readonly ay: number;
}

/**
 * Beside the line, on either side, one label depth further out at each step: across the stretch
 * the label sits on (a self-loop's has no length: then up and down).
 */
function besideFrame({ r, lw, lh, given, online }: ClearestInput): BesideFrame {
  const len = Math.hypot(r.x1 - r.x0, r.y1 - r.y0);
  const [nx, ny] = len > 0 ? [-(r.y1 - r.y0) / len, (r.x1 - r.x0) / len] : [0, 1];
  return {
    nx,
    ny,
    half: Math.abs(nx) * (lw / 2) + Math.abs(ny) * (lh / 2) + M.besideGap,
    depth: Math.abs(nx) * lw + Math.abs(ny) * lh,
    ax: given[0] - online[0],
    ay: given[1] - online[1],
  };
}

/** A spot as {@link SpotSearch} keeps it: `at` along the stretch, `dx`, `dy` off it. */
interface Spot {
  readonly at: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * One measure {@link SpotSearch} judges the spots by (with the frames' borders or without), and
 * the best spot it has found by it so far. It takes the spots its own search would have tried:
 * none once it found a clear one, none in the rest of a pass once stepping out is not worth it.
 */
class Judge {
  best: Spot;
  least = Infinity;
  worst = Infinity;
  crossed = 0;
  clear = false;
  open = true;

  constructor(
    readonly borders: boolean,
    start: Spot
  ) {
    this.best = start;
  }

  get taking(): boolean {
    return this.open && !this.clear;
  }

  /** Whether a spot covering `bad` of what it must not cover is no better than the best. */
  worse(bad: number): boolean {
    return bad > this.worst || (bad === this.worst && bad > 0);
  }

  /** A spot tried: kept when it covers less than the best; the judge is done when it is clear. */
  offer(spot: Spot, bad: number, lines: number, cost: number): void {
    if (bad < this.worst || cost < this.least) {
      [this.worst, this.least, this.crossed] = [bad, cost, lines];
      this.best = spot;
    }
    if (bad === 0 && cost === 0) this.clear = true;
  }

  /** Whether step `k` out is still worth a try: in reach, and cheaper than the best so far. */
  worthStepping(k: number, split: number, step: number): boolean {
    return k < M.besideSteps * split && (this.worst > 0 || k * step < this.least);
  }

  result(): Clearest {
    return { ...this.best, crowded: this.worst > 0 || this.crossed > 0 };
  }
}

/** The search {@link clearest} runs, and the best spots its judges have found so far. */
class SpotSearch {
  /** With the borders (when there are any), then, when there are, without them. */
  private readonly judges: readonly Judge[];
  /** What another relation's line through the label costs. */
  private readonly perLine: number;
  private readonly ons: readonly Offset[];
  private readonly frame: BesideFrame;

  constructor(private readonly input: ClearestInput) {
    const { lw, lh, given, keep } = input;
    const start = { at: M.slide[0]!, dx: given[0], dy: given[1] };
    this.judges = keep.borders
      ? [new Judge(true, start), new Judge(false, start)]
      : [new Judge(true, start)];
    this.perLine = M.lineCover * lw * lh;
    this.ons = onLineOffsets(given, input.online, keep.tags);
    this.frame = besideFrame(input);
  }

  /**
   * The coarse pass, then, for each judge that found no clear spot and whose best one is crowded
   * or whose label is a tag, the finer one: a tag keeps `tagClear` from the shapes without
   * floating a depth out.
   */
  run(): void {
    const { tags } = this.input.keep;
    this.pass(M.slide, 1);
    for (const j of this.judges) j.open = j.worst > 0 || j.crossed > 0 || tags;
    if (this.judges.some((j) => j.taking)) this.pass(M.fineSlide, tags ? M.tagSplit : M.fineSplit);
  }

  results(): [Clearest, Clearest | undefined] {
    return [this.judges[0]!.result(), this.judges[1]?.result()];
  }

  /** Whether every judge has its spot: a clear one, or none more to take in this pass. */
  private settled(): boolean {
    return !this.judges.some((j) => j.taking);
  }

  /**
   * One pass: `slides` along the line, then `split` steps beside it per label depth. A tag tries
   * the finer places on its line before any beside it (#955 review): one that fits between the
   * shapes stays on its line, where its bare text sat.
   */
  private pass(slides: readonly number[], split: number): void {
    const finer = this.input.keep.tags && slides !== M.fineSlide;
    if (this.onLine(slides) || (finer && this.onLine(M.fineSlide))) return;
    this.beside(slides, split);
  }

  private onLine(slides: readonly number[]): boolean {
    return this.ons.some(([px, py]) => this.tryAt(slides, px, py, 0));
  }

  /**
   * Beside the line on either side, a step further out each time. Each depth out past the first
   * costs a share of a line through the label: a label keeps by its own line rather than move
   * far from it to clear another's.
   */
  private beside(slides: readonly number[], split: number): void {
    const { nx, ny, half, depth, ax, ay } = this.frame;
    const step = (M.besideStepCost * this.perLine) / split;
    for (let k = 0; this.stepOut(k, split, step); k++)
      for (const side of [1, -1]) {
        const d = side * (half + (k * depth) / split);
        if (this.tryAt(slides, ax + nx * d, ay + ny * d, k / split)) return;
      }
  }

  /** Closes the judges for which step `k` out is not worth it; whether any still takes spots. */
  private stepOut(k: number, split: number, step: number): boolean {
    for (const j of this.judges) if (j.taking && !j.worthStepping(k, split, step)) j.open = false;
    return !this.settled();
  }

  /** Each place of `slides` along the line, (px, py) off it; true once every judge is settled. */
  private tryAt(slides: readonly number[], px: number, py: number, away: number): boolean {
    return slides.some((t) => this.tryOne(t, px, py, away));
  }

  /** One spot, offered to every judge still taking spots; true once every judge is settled. */
  private tryOne(t: number, px: number, py: number, away: number): boolean {
    const box = this.boxAt(t, px, py);
    const [rest, border] = forbiddenParts(this.input.keep, box);
    const bads = this.judges.map((j) =>
      j.taking && !j.worse(rest + (j.borders ? border : 0)) ? rest + (j.borders ? border : 0) : -1
    );
    if (bads.every((bad) => bad < 0)) return false;
    const [lines, cost] = bads.includes(0) ? this.costOf(box, away) : [0, Infinity];
    const spot = { at: t, dx: px, dy: py };
    for (const [i, bad] of bads.entries()) {
      if (bad > 0) this.judges[i]!.offer(spot, bad, 0, Infinity);
      else if (bad === 0) this.judges[i]!.offer(spot, 0, lines, cost);
    }
    return this.settled();
  }

  private boxAt(t: number, px: number, py: number): Box {
    const { r, lw, lh } = this.input;
    const [x, y] = [r.x0 + (r.x1 - r.x0) * t + px, r.y0 + (r.y1 - r.y0) * t + py];
    return { x0: x - lw / 2, y0: y - lh / 2, x1: x + lw / 2, y1: y + lh / 2 };
  }

  /** A clear spot's cost: what it covers of `taken`, the lines through it, how far out it is. */
  private costOf(box: Box, away: number): [number, number] {
    const { keep } = this.input;
    const lines = keep.lines.through(keep.own, box.x0, box.y0, box.x1, box.y1);
    const cover = keep.taken.covered(box.x0, box.y0, box.x1, box.y1);
    return [lines, cover + (lines + away * M.besideStepCost) * this.perLine];
  }
}
