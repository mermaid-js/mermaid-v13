/**
 * Layout invariants for `SequenceLayout` (spec #125 T3), the custom layout's counterpart of the
 * graph engine's `validateLayout`. Each is a property of the output that the layout code does
 * not build by construction: no NaN; every message and note of the model laid out; messages
 * inside their participants' span and columns; frames holding their members (lines, labels,
 * notes, nested frames), their tab, title and section labels; a frame title right of its tab;
 * notes clear of participant boxes; a wrapped label between neighbouring participants clear of
 * both lifelines; activation bars on their lifeline or touching the bar they stack on. Each
 * violation is one readable line. Comparisons allow a float tolerance.
 *
 * Not checked: that `bounds` holds everything, because the layout grows it to do so.
 */
import type { SequenceMessage, SequenceModel, SequenceStatement } from '../model.ts';
import type {
  ActivationLayout,
  MessageLayout,
  ParticipantLayout,
  Rect,
  SequenceLayout,
} from './types.ts';
import {
  EPS,
  nonFinite as numbers,
  rectsOverlap as overlaps,
  within,
} from '@mermaid-js/shared/testing/layout-invariants';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import { autoWrapOf } from './env.ts';
import { metricsTable } from './metrics.ts';

type Participants = ReadonlyMap<string, ParticipantLayout>;

/** Top of the top box to the end of the participant: the bottom box or the lifeline's end. */
function span(p: ParticipantLayout): [number, number] {
  return [p.top, p.bottom !== undefined ? p.bottom + p.height : p.lifeline.y2];
}

function boxesOf(p: ParticipantLayout): Rect[] {
  const r = [{ x: p.x, y: p.top, width: p.width, height: p.height }];
  if (p.bottom !== undefined) r.push({ x: p.x, y: p.bottom, width: p.width, height: p.height });
  return r;
}

const inside = (r: Rect, x: number, y: number): boolean =>
  within(x, r.x, r.x + r.width) && within(y, r.y, r.y + r.height);
const contains = (outer: Rect, inner: Rect): boolean =>
  inside(outer, inner.x, inner.y) && inside(outer, inner.x + inner.width, inner.y + inner.height);

/** The rectangles a message takes: its line (and self loop), and its label. */
function messageRects(msg: MessageLayout): Rect[] {
  const x1 = Math.min(msg.startX, msg.stopX);
  const x2 = Math.max(msg.startX, msg.stopX, msg.self?.right ?? -Infinity);
  const line = { x: x1, y: msg.y, width: x2 - x1, height: (msg.self?.bottom ?? msg.y) - msg.y };
  return msg.label ? [line, msg.label] : [line];
}

function innerOf(s: SequenceStatement): readonly SequenceStatement[] | undefined {
  if (s.kind === 'fragment') return s.sections.flatMap((section) => section.statements);
  if (s.kind === 'rect') return s.statements;
  return undefined;
}

/** The AST ids of the messages, notes and frames inside `list`, at any depth. */
function members(list: readonly SequenceStatement[], out: string[] = []): string[] {
  for (const s of list) {
    if (s.kind === 'message' || s.kind === 'note') out.push(s.ast);
    const inner = innerOf(s);
    if (inner) {
      out.push(s.ast);
      members(inner, out);
    }
  }
  return out;
}

/** Each frame (fragment or rect) of the model with its members. */
function frames(list: readonly SequenceStatement[], out: [string, string[]][] = []) {
  for (const s of list) {
    const inner = innerOf(s);
    if (!inner) continue;
    out.push([s.ast, members(inner)]);
    frames(inner, out);
  }
  return out;
}

function columnsApart(layout: SequenceLayout, out: string[]): void {
  const sorted = [...layout.participants].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as ParticipantLayout;
    const b = sorted[i] as ParticipantLayout;
    if (a.x + a.width > b.x + EPS) out.push(`participant ${a.id} overlaps ${b.id}`);
  }
  for (const p of layout.participants)
    if (p.lifeline.y2 < p.lifeline.y1 - EPS) out.push(`lifeline of ${p.id} runs upward`);
}

/** Every message and note of the model is laid out. */
function allLaidOut(model: SequenceModel, rectsOf: ReadonlyMap<string, Rect[]>, out: string[]) {
  for (const id of members(model.statements))
    if (!rectsOf.has(id)) out.push(`${id} is not laid out`);
}

function messagesInSpan(layout: SequenceLayout, parts: Participants, out: string[]): void {
  const bars = (id: string): ActivationLayout[] =>
    layout.activations.filter((a) => a.participant === id);
  for (const msg of layout.messages) {
    const f = parts.get(msg.from);
    const t = parts.get(msg.to);
    if (!f || !t) {
      out.push(`message ${msg.ast} names a participant that is not laid out`);
      continue;
    }
    for (const p of [f, t]) {
      const [y1, y2] = span(p);
      if (!within(msg.y, y1, y2)) out.push(`message ${msg.ast} at y ${msg.y} is outside ${p.id}`);
    }
    // The ends stay within the two columns, or on a bar wider than its column.
    const rects: Pick<Rect, 'x' | 'width'>[] = [f, t, ...bars(f.id), ...bars(t.id)];
    const lo = Math.min(...rects.map((r) => r.x));
    const hi = Math.max(...rects.map((r) => r.x + r.width));
    for (const x of [msg.startX, msg.stopX])
      if (!within(x, lo, hi)) out.push(`message ${msg.ast} end x ${x} is outside its columns`);
  }
}

function framesHold(
  model: SequenceModel,
  layout: SequenceLayout,
  rectsOf: ReadonlyMap<string, Rect[]>,
  out: string[]
): void {
  for (const [ast, inner] of frames(model.statements)) {
    const frame = rectsOf.get(ast)?.[0];
    if (!frame) continue;
    for (const id of inner)
      for (const r of rectsOf.get(id) ?? [])
        if (!contains(frame, r)) out.push(`frame ${ast} does not contain ${id}`);
  }
  for (const f of layout.fragments) {
    if (!contains(f, f.tab)) out.push(`frame ${f.ast} does not contain its tab`);
    if (f.title && !contains(f, f.title)) out.push(`frame ${f.ast} does not contain its title`);
    for (const s of f.sections) {
      if (!within(s.y, f.y, f.y + f.height))
        out.push(`frame ${f.ast} section at ${s.y} is outside`);
      if (s.label && !contains(f, s.label))
        out.push(`frame ${f.ast} does not contain a section label`);
    }
  }
}

/**
 * A frame's title starts at or right of its tab's right edge, so the two never overlap (#1361,
 * D734: a `critical` tab wider than `labelBoxWidth` ran into the title). Not in cells, where the
 * keyword is written on the top border and the title on a row below it.
 */
function titlesClearTabs(layout: SequenceLayout, out: string[]): void {
  if (layout.units === 'cell') return;
  for (const f of layout.fragments)
    if (f.title && f.title.x < f.tab.x + f.tab.width - EPS)
      out.push(`the title of frame ${f.ast} overlaps its tab`);
}

function notesClear(layout: SequenceLayout, out: string[]): void {
  for (const n of layout.notes)
    for (const p of layout.participants)
      for (const r of boxesOf(p))
        if (overlaps(n, r)) out.push(`note ${n.ast} overlaps the box of ${p.id}`);
}

/** Whether a rectangle and a circle share more than `EPS` of area along any line. */
function rectCuts(r: Rect, cx: number, cy: number, radius: number): boolean {
  const dx = cx - Math.max(r.x, Math.min(cx, r.x + r.width));
  const dy = cy - Math.max(r.y, Math.min(cy, r.y + r.height));
  return Math.hypot(dx, dy) < radius - EPS;
}

/** A sequence number's circle: the message it numbers, and its centre. */
interface Circle {
  readonly ast: string;
  readonly x: number;
  readonly y: number;
}

/**
 * No message label runs into a sequence number's circle, its own or another message's
 * (#1337: a self message's label lowered onto its number). The circles are sorted by y, and
 * each label is checked against those within a radius of its rows only.
 */
function numbersClear(layout: SequenceLayout, out: string[]): void {
  const radius = metricsTable({ id: layout.units }).fixed.numberRadius;
  if (radius <= 0) return;
  const circles: Circle[] = layout.messages
    .flatMap((n) => (n.number ? [{ ast: n.ast, x: n.number.x, y: n.y }] : []))
    .sort((a, b) => a.y - b.y);
  for (const msg of layout.messages) {
    const label = msg.label;
    if (!label) continue;
    // The first circle whose centre is at most a radius above the label.
    let lo = 0;
    let hi = circles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((circles[mid] as Circle).y < label.y - radius) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < circles.length; i++) {
      const c = circles[i] as Circle;
      if (c.y > label.y + label.height + radius) break;
      if (rectCuts(label, c.x, c.y, radius))
        out.push(`the label of message ${msg.ast} overlaps the number of ${c.ast}`);
    }
  }
}

/**
 * A message label ends at or above its line, so the line never strikes through it (#1337
 * review: a large `wrapPadding`, a small message font or a square self message put the last
 * baseline at or below the line). For a self message the line is the loop's start, where the
 * label sits.
 */
function labelsAboveLines(layout: SequenceLayout, out: string[]): void {
  for (const msg of layout.messages)
    if (msg.label && msg.label.y + msg.label.height > msg.y + EPS)
      out.push(`the label of message ${msg.ast} reaches below its line`);
}

/** The messages of `list`, at any depth. */
function messagesOf(list: readonly SequenceStatement[], out: SequenceMessage[] = []) {
  for (const s of list) {
    if (s.kind === 'message') out.push(s);
    const inner = innerOf(s);
    if (inner) messagesOf(inner, out);
  }
  return out;
}

/** Whether a line of `text` is one word, which wrapping keeps whole, wider than `room`. */
function wordWider(text: MeasuredLabel, room: number): boolean {
  return text.lines.some((line, i) => {
    const words = line
      .map((r) => r.text)
      .join('')
      .trim();
    return !/\s/.test(words) && (text.widths[i] ?? 0) > room + EPS;
  });
}

/**
 * The label of a wrapped message between neighbouring participants stays between their
 * lifelines, in every `messageAlign` (#1239, D724). A self message and a message across several
 * columns are not checked: their labels may reach past a lifeline, as in v12. Nor is a message
 * whose line leaves the lifelines, when activation bars wider than the gap cover the other one,
 * or whose label holds a word wider than its line, which stays whole (D724).
 * Cells have their own rule: a label keeps off the lifeline columns and off box borders, and may
 * move past a lifeline to do so (the conformance spec `layout-corpus.spec.ts` checks it).
 */
function wrappedInside(
  model: SequenceModel,
  layout: SequenceLayout,
  autoWrap: boolean,
  out: string[]
): void {
  if (layout.units !== 'px') return;
  const wraps = new Map(messagesOf(model.statements).map((s) => [s.ast, s.wrap ?? autoWrap]));
  const order = new Map(layout.participants.map((p, i) => [p.id, i]));
  for (const msg of layout.messages) {
    const a = order.get(msg.from);
    const b = order.get(msg.to);
    if (!msg.label || !wraps.get(msg.ast) || a === undefined || b === undefined) continue;
    if (Math.abs(a - b) !== 1) continue;
    const left = layout.participants[Math.min(a, b)] as ParticipantLayout;
    const right = layout.participants[Math.max(a, b)] as ParticipantLayout;
    const ends = [msg.startX, msg.stopX];
    if (!ends.every((e) => within(e, left.lifeline.x, right.lifeline.x))) continue;
    if (wordWider(msg.label.text, Math.abs(msg.startX - msg.stopX))) continue;
    const { x, width } = msg.label;
    if (x < left.lifeline.x - EPS || x + width > right.lifeline.x + EPS)
      out.push(`the wrapped label of message ${msg.ast} crosses a lifeline`);
  }
}

/**
 * A first bar covers its lifeline; a stacked bar starts inside the bar below it (depth one
 * less, open at the time) and right of its left edge. All stay within the participant's span.
 */
function activationsOnLifeline(layout: SequenceLayout, parts: Participants, out: string[]): void {
  for (const a of layout.activations) {
    const p = parts.get(a.participant);
    if (!p) {
      out.push(`activation of ${a.participant} has no participant`);
      continue;
    }
    const [y1, y2] = span(p);
    if (!within(a.y, y1, y2) || !within(a.y + a.height, y1, y2))
      out.push(`activation of ${p.id} runs past its lifeline`);
    if (a.depth === 0) {
      if (!within(p.lifeline.x, a.x, a.x + a.width))
        out.push(`activation of ${p.id} at x ${a.x} is off its lifeline`);
      continue;
    }
    // A bar below that was never closed is not drawn; then only its side of the lifeline counts.
    const under = layout.activations.filter(
      (b) =>
        b.participant === a.participant &&
        b.depth === a.depth - 1 &&
        within(a.y, b.y, b.y + b.height)
    );
    const onBar = under.some((b) => a.x > b.x + EPS && within(a.x, b.x, b.x + b.width));
    if (under.length > 0 ? !onBar : a.x + a.width < p.lifeline.x - EPS)
      out.push(`activation of ${p.id} at depth ${a.depth} is not on the bar below it`);
  }
}

/**
 * Participant rows: a lifeline starts at or below the bottom of its row; under the band model
 * (#194) the glyph band lies inside the row, and the label lies under the band and inside the
 * row, at the top and at the bottom.
 */
function rowsHold(layout: SequenceLayout, out: string[]): void {
  for (const p of layout.participants) {
    if (p.lifeline.y1 < p.top + p.height - EPS)
      out.push(`the lifeline of ${p.id} starts inside its row`);
    const band = p.band;
    if (!band) continue;
    const half = p.label.height / 2;
    const check = (where: string, edge: number, labelY: number): void => {
      if (band.height <= 0 || edge - band.height < -EPS || edge > p.height + EPS)
        out.push(`the ${where} glyph band of ${p.id} leaves its row`);
      if (labelY - half < edge - EPS) out.push(`the ${where} label of ${p.id} overlaps its symbol`);
      if (labelY - half < -EPS || labelY + half > p.height + EPS)
        out.push(`the ${where} label of ${p.id} leaves its row`);
    };
    check('top', band.top, p.labelY);
    if (p.bottom !== undefined) check('bottom', band.bottom, p.bottomLabelY ?? p.labelY);
  }
}

/**
 * Every invariant `layout` breaks; empty when it holds them all. `config` is the config the
 * layout was made with: its `wrap` and `sequence.wrap` say which messages wrap, as in the layout.
 */
export function sequenceLayoutViolations(
  model: SequenceModel,
  layout: SequenceLayout,
  config: { readonly wrap?: unknown; readonly sequence?: Readonly<Record<string, unknown>> }
): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  const parts = new Map(layout.participants.map((p) => [p.id, p]));
  const rectsOf = new Map<string, Rect[]>();
  for (const msg of layout.messages) rectsOf.set(msg.ast, messageRects(msg));
  for (const r of [...layout.notes, ...layout.fragments, ...layout.rects]) rectsOf.set(r.ast, [r]);
  columnsApart(layout, out);
  allLaidOut(model, rectsOf, out);
  messagesInSpan(layout, parts, out);
  framesHold(model, layout, rectsOf, out);
  titlesClearTabs(layout, out);
  notesClear(layout, out);
  numbersClear(layout, out);
  labelsAboveLines(layout, out);
  wrappedInside(model, layout, autoWrapOf(config), out);
  activationsOnLifeline(layout, parts, out);
  rowsHold(layout, out);
  return out;
}
