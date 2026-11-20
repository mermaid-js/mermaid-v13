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
import type { Route, Work } from './route.ts';
import { hitRect } from './shapes.ts';

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
}

/** What a label keeps off while it is placed. */
export interface Keep {
  /** What it should cover least of: shapes but their edges, arrowheads, headers, labels. */
  readonly taken: Taken;
  /** What it must not cover at all: whole shapes and boundary headers. */
  readonly blocked: Taken;
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

/** How much of a label box it must not cover: `blocked`, and its own heads. */
function forbidden(keep: Keep, { x0, y0, x1, y1 }: Box): number {
  let area = keep.blocked.covered(x0, y0, x1, y1);
  const h = keep.heads;
  keep.work.charge(h.length / 2);
  for (let i = 0; i < h.length; i += 2) {
    const w = Math.min(x1, h[i]! + M.arrow) - Math.max(x0, h[i]! - M.arrow);
    const t = Math.min(y1, h[i + 1]! + M.arrow) - Math.max(y0, h[i + 1]! - M.arrow);
    if (w > 0 && t > 0) area += w * t;
  }
  return area;
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
export function placeLabel({ rel, index, r, input, keep }: LabelInput): LabelSpot {
  const measured = measureLabel(input, rel, index, r.room);
  if (!measured) return { cx: r.x0, top: r.y0, lw: 0, lh: 0 };
  const { label, techn, lw, lh } = measured;

  const beside = Math.abs(r.nx) * (lw / 2) + Math.abs(r.ny) * (lh / 2) + M.besideGap;
  const aside = r.lean ? Math.max(0, Math.min(r.lean, beside - M.leanSlack)) : beside;
  let dx = r.nx * aside + offset(rel.offsetX);
  let dy = r.ny * aside + offset(rel.offsetY);
  let at = M.slide[0]!;
  let crowded = false;
  if (keep)
    ({ at, dx, dy, crowded } = clearest({
      r,
      lw,
      lh,
      given: [dx, dy],
      online: [r.nx * aside, r.ny * aside],
      keep,
    }));
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
 */
function clearest(input: ClearestInput): Clearest {
  const search = new SpotSearch(input);
  search.run();
  return search.result();
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

/** The search {@link clearest} runs, and the best spot it has found so far. */
class SpotSearch {
  private best: { at: number; dx: number; dy: number };
  private least = Infinity;
  private worst = Infinity;
  private crossed = 0;
  /** What another relation's line through the label costs. */
  private readonly perLine: number;
  private readonly ons: readonly Offset[];
  private readonly frame: BesideFrame;

  constructor(private readonly input: ClearestInput) {
    const { lw, lh, given, keep } = input;
    this.best = { at: M.slide[0]!, dx: given[0], dy: given[1] };
    this.perLine = M.lineCover * lw * lh;
    this.ons = onLineOffsets(given, input.online, keep.tags);
    this.frame = besideFrame(input);
  }

  /**
   * The coarse pass, then, when it found no clear spot and the best one is crowded or the label
   * is a tag, the finer one: a tag keeps `tagClear` from the shapes without floating a depth out.
   */
  run(): void {
    const { tags } = this.input.keep;
    if (this.pass(M.slide, 1)) return;
    if (this.worst > 0 || this.crossed > 0 || tags)
      this.pass(M.fineSlide, tags ? M.tagSplit : M.fineSplit);
  }

  result(): Clearest {
    return { ...this.best, crowded: this.worst > 0 || this.crossed > 0 };
  }

  /**
   * One pass: `slides` along the line, then `split` steps beside it per label depth. A tag tries
   * the finer places on its line before any beside it (#955 review): one that fits between the
   * shapes stays on its line, where its bare text sat.
   */
  private pass(slides: readonly number[], split: number): boolean {
    const finer = this.input.keep.tags && slides !== M.fineSlide;
    if (this.onLine(slides) || (finer && this.onLine(M.fineSlide))) return true;
    return this.beside(slides, split);
  }

  private onLine(slides: readonly number[]): boolean {
    return this.ons.some(([px, py]) => this.tryAt(slides, px, py, 0));
  }

  /**
   * Beside the line on either side, a step further out each time. Each depth out past the first
   * costs a share of a line through the label: a label keeps by its own line rather than move
   * far from it to clear another's.
   */
  private beside(slides: readonly number[], split: number): boolean {
    const { nx, ny, half, depth, ax, ay } = this.frame;
    const step = (M.besideStepCost * this.perLine) / split;
    for (let k = 0; this.worthStepping(k, split, step); k++)
      for (const side of [1, -1]) {
        const d = side * (half + (k * depth) / split);
        if (this.tryAt(slides, ax + nx * d, ay + ny * d, k / split)) return true;
      }
    return false;
  }

  /** Whether step `k` out is still worth a try: in reach, and cheaper than the best so far. */
  private worthStepping(k: number, split: number, step: number): boolean {
    return k < M.besideSteps * split && (this.worst > 0 || k * step < this.least);
  }

  /** Each place of `slides` along the line, (px, py) off it; true at the first clear one. */
  private tryAt(slides: readonly number[], px: number, py: number, away: number): boolean {
    return slides.some((t) => this.tryOne(t, px, py, away));
  }

  /** One spot: kept when it covers less than the best; true when it covers nothing. */
  private tryOne(t: number, px: number, py: number, away: number): boolean {
    const box = this.boxAt(t, px, py);
    const bad = forbidden(this.input.keep, box);
    if (this.worse(bad)) return false;
    const [lines, cost] = bad > 0 ? [0, Infinity] : this.costOf(box, away);
    if (bad < this.worst || cost < this.least) {
      [this.worst, this.least, this.crossed] = [bad, cost, lines];
      this.best = { at: t, dx: px, dy: py };
    }
    return bad === 0 && cost === 0;
  }

  /** Whether a spot covering `bad` of what it must not cover is no better than the best. */
  private worse(bad: number): boolean {
    return bad > this.worst || (bad === this.worst && bad > 0);
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
