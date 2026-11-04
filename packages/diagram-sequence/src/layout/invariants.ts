/**
 * Layout invariants for `SequenceLayout` (spec #125 T3), the custom layout's counterpart of the
 * graph engine's `validateLayout`: no NaN; messages inside their participants' span; frames
 * holding their messages, notes and nested frames; notes clear of participant boxes; activations
 * on their lifeline; everything inside the bounds. Each violation is one readable line.
 */
import type { SequenceModel, SequenceStatement } from '../model.ts';
import type { MessageLayout, ParticipantLayout, Rect, SequenceLayout } from './types.ts';

type Participants = ReadonlyMap<string, ParticipantLayout>;

function numbers(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => numbers(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) numbers(v, `${path}.${k}`, out);
}

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
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
const contains = (outer: Rect, inner: Rect): boolean =>
  inside(outer, inner.x, inner.y) && inside(outer, inner.x + inner.width, inner.y + inner.height);
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The rectangle a message's line (and self loop) takes. */
function lineRect(msg: MessageLayout): Rect {
  const x1 = Math.min(msg.startX, msg.stopX);
  const x2 = Math.max(msg.startX, msg.stopX, msg.self?.right ?? -Infinity);
  return { x: x1, y: msg.y, width: x2 - x1, height: (msg.self?.bottom ?? msg.y) - msg.y };
}

/** The AST ids of the messages, notes and frames inside `list`, at any depth. */
function members(list: readonly SequenceStatement[], out: string[] = []): string[] {
  for (const s of list) {
    if (s.kind === 'message' || s.kind === 'note') out.push(s.ast);
    else if (s.kind === 'fragment') {
      out.push(s.ast);
      for (const section of s.sections) members(section.statements, out);
    } else if (s.kind === 'rect') {
      out.push(s.ast);
      members(s.statements, out);
    }
  }
  return out;
}

function innerOf(s: SequenceStatement): readonly SequenceStatement[] | undefined {
  if (s.kind === 'fragment') return s.sections.flatMap((section) => section.statements);
  if (s.kind === 'rect') return s.statements;
  return undefined;
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
    if (a.x + a.width > b.x) out.push(`participant ${a.id} overlaps ${b.id}`);
  }
  for (const p of layout.participants)
    if (p.lifeline.y2 < p.lifeline.y1) out.push(`lifeline of ${p.id} runs upward`);
}

function messagesInSpan(layout: SequenceLayout, parts: Participants, out: string[]): void {
  for (const msg of layout.messages) {
    const f = parts.get(msg.from);
    const t = parts.get(msg.to);
    if (!f || !t) {
      out.push(`message ${msg.ast} names a participant that is not laid out`);
      continue;
    }
    for (const p of [f, t]) {
      const [y1, y2] = span(p);
      if (msg.y < y1 || msg.y > y2) out.push(`message ${msg.ast} at y ${msg.y} is outside ${p.id}`);
    }
    const lo = Math.min(f.x, t.x);
    const hi = Math.max(f.x + f.width, t.x + t.width);
    for (const x of [msg.startX, msg.stopX])
      if (x < lo || x > hi) out.push(`message ${msg.ast} end x ${x} is outside its columns`);
  }
}

function framesHold(
  model: SequenceModel,
  layout: SequenceLayout,
  rectOf: ReadonlyMap<string, Rect>,
  out: string[]
): void {
  for (const [ast, inner] of frames(model.statements)) {
    const frame = rectOf.get(ast);
    if (!frame) {
      out.push(`frame ${ast} is not laid out`);
      continue;
    }
    for (const id of inner) {
      const r = rectOf.get(id);
      if (r && !contains(frame, r)) out.push(`frame ${ast} does not contain ${id}`);
    }
  }
  for (const f of layout.fragments) {
    if (!contains(f, f.tab)) out.push(`frame ${f.ast} does not contain its tab`);
    for (const s of f.sections)
      if (s.y < f.y || s.y > f.y + f.height)
        out.push(`frame ${f.ast} section at ${s.y} is outside`);
  }
}

function notesClear(layout: SequenceLayout, out: string[]): void {
  for (const n of layout.notes)
    for (const p of layout.participants)
      for (const r of boxesOf(p))
        if (overlaps(n, r)) out.push(`note ${n.ast} overlaps the box of ${p.id}`);
}

/** The bar is centred half a bar width per level right of the lifeline, within its span. */
function activationsOnLifeline(layout: SequenceLayout, parts: Participants, out: string[]): void {
  for (const a of layout.activations) {
    const p = parts.get(a.participant);
    if (!p) {
      out.push(`activation of ${a.participant} has no participant`);
      continue;
    }
    const x = p.lifeline.x + (a.depth * a.width) / 2;
    if (x < a.x || x > a.x + a.width)
      out.push(`activation of ${p.id} at x ${a.x} is off its lifeline`);
    const [y1, y2] = span(p);
    if (a.y < y1 || a.y + a.height > y2) out.push(`activation of ${p.id} runs past its lifeline`);
  }
}

function insideBounds(
  layout: SequenceLayout,
  rectOf: ReadonlyMap<string, Rect>,
  out: string[]
): void {
  const all: [string, Rect | undefined][] = [
    ...layout.participants.flatMap((p) => boxesOf(p).map((r): [string, Rect] => [p.id, r])),
    ...rectOf,
    ...layout.messages.map((msg): [string, Rect | undefined] => [msg.ast, msg.label]),
    ...layout.activations.map((a): [string, Rect] => [`activation of ${a.participant}`, a]),
    ...layout.boxes.map((b): [string, Rect] => [b.ast, b]),
  ];
  for (const [id, r] of all)
    if (r && !contains(layout.bounds, r)) out.push(`${id} is outside the bounds`);
}

/** Every invariant `layout` breaks; empty when it holds them all. */
export function sequenceLayoutViolations(model: SequenceModel, layout: SequenceLayout): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  const parts = new Map(layout.participants.map((p) => [p.id, p]));
  const rectOf = new Map<string, Rect>();
  for (const msg of layout.messages) rectOf.set(msg.ast, lineRect(msg));
  for (const r of [...layout.notes, ...layout.fragments, ...layout.rects]) rectOf.set(r.ast, r);
  columnsApart(layout, out);
  messagesInSpan(layout, parts, out);
  framesHold(model, layout, rectOf, out);
  notesClear(layout, out);
  activationsOnLifeline(layout, parts, out);
  insideBounds(layout, rectOf, out);
  return out;
}
