/**
 * The second pass (v12's `draw` loop over the messages, without the drawing): moves down the
 * statements, giving each message, note, activation, fragment and rect its rows. Frames are open
 * on the running bounds while their statements are laid out, so they grow to hold them.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type {
  FragmentKind,
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceRect,
  SequenceStatement,
} from '../model.ts';
import type { Bounds, OpenFrame } from './bounds.ts';
import { columnSpan } from './columns.ts';
import { REVERSE_ARROWS, alignX, placed, type Column, type Env } from './env.ts';
import { barX, type Geometry, type MessageX } from './geometry.ts';
import type {
  ActivationLayout,
  FragmentLayout,
  MessageLayout,
  NoteLayout,
  Rect,
  RectLayout,
  SelfLoop,
} from './types.ts';

// Participant kinds drawn as a narrow symbol: a creating message stops at the symbol.
const SYMBOL_KINDS: ReadonlySet<string> = new Set(['actor', 'control', 'entity', 'database']);
// The frame tab keyword of each fragment kind.
const TAB: Readonly<Record<FragmentKind, string>> = {
  loop: 'loop',
  alt: 'alt',
  opt: 'opt',
  par: 'par',
  par_over: 'par',
  critical: 'critical',
  break: 'break',
};

interface OpenBar {
  readonly actor: string;
  readonly startx: number;
  readonly stopx: number;
  y: number;
  readonly depth: number;
  readonly ast?: AstId;
}

/** As in v12, a start or step of 0 (or none) keeps the current one. */
const orKeep = (v: number | undefined, current: number): number =>
  v === undefined || v === 0 || Number.isNaN(v) ? current : v;

/** Where the lifeline starts below the top of a column's symbol. */
export function lifelineOffset(env: Env, c: Column): number {
  const { m } = env;
  if (c.p.kind === 'database') return c.height + m.databaseTextMargins * m.boxTextMargin.y;
  return Math.max(c.height, m.glyphLifeline[c.p.kind] ?? 0);
}

export class Rows {
  readonly messages: MessageLayout[] = [];
  readonly notes: NoteLayout[] = [];
  readonly activations: ActivationLayout[] = [];
  readonly fragments: FragmentLayout[] = [];
  readonly rects: RectLayout[] = [];
  private readonly open: OpenBar[] = [];
  private readonly createdBy = new Map<AstId, Column>();
  private readonly destroyedBy = new Map<AstId, Column>();
  private seqIndex = 1;
  private seqStep = 1;
  private numbers: boolean;

  constructor(
    private readonly env: Env,
    private readonly geometry: Geometry,
    private readonly b: Bounds
  ) {
    this.numbers = env.seq.showSequenceNumbers === true;
    for (const c of env.columns.values()) {
      if (c.p.createdBy !== undefined) this.createdBy.set(c.p.createdBy, c);
      if (c.p.destroyedBy !== undefined) this.destroyedBy.set(c.p.destroyedBy, c);
    }
  }

  statements(list: readonly SequenceStatement[]): void {
    for (const s of list) {
      switch (s.kind) {
        case 'message':
          this.message(s);
          break;
        case 'note':
          this.note(s);
          break;
        case 'activation':
          if (s.active) this.activate(s.participant, s.ast);
          else this.deactivate(s.participant);
          break;
        case 'fragment':
          this.fragment(s);
          break;
        case 'rect':
          this.rect(s);
          break;
        case 'autonumber':
          this.seqIndex = orKeep(s.start, this.seqIndex);
          this.seqStep = orKeep(s.step, this.seqStep);
          this.numbers = s.visible || this.env.seq.showSequenceNumbers === true;
          break;
      }
    }
  }

  private activate(actor: string, ast?: AstId): void {
    const c = this.env.columns.get(actor);
    if (!c) return;
    const depth = this.open.filter((a) => a.actor === actor).length;
    const x = barX(this.env, c, depth);
    this.open.push({
      actor,
      startx: x,
      stopx: x + this.env.m.activationWidth,
      y: this.b.y + this.env.m.activationLead,
      depth,
      ...(ast !== undefined ? { ast } : {}),
    });
  }

  private deactivate(actor: string): void {
    const { m } = this.env;
    const i = this.open.map((a) => a.actor).lastIndexOf(actor);
    if (i < 0) return;
    const [a] = this.open.splice(i, 1) as [OpenBar];
    let end = this.b.y;
    if (a.y + m.activationMin > end) {
      a.y = end - m.activationShortLead;
      end += m.activationShortTail;
    }
    this.activations.push({
      participant: a.actor,
      ...(a.ast !== undefined ? { ast: a.ast } : {}),
      x: a.startx,
      y: a.y,
      width: a.stopx - a.startx,
      height: end - a.y,
      depth: a.depth,
    });
    this.b.insert(a.startx, end - m.activationRise, a.stopx, end);
  }

  /** v12 `boundMessage`: the rows of a message; returns the y of its line. */
  private boundMessage(g: MessageX, self: boolean): number {
    const { b } = this;
    const { m } = this.env;
    const starty = b.y;
    const textH = g.label.height;
    b.bump(m.messageLead);
    b.bump(m.messageLeadLines * (g.label.lines.length > 0 ? g.label.lineHeight : 0));
    let total = textH - m.messageLead;
    let lineY: number;
    if (self) {
      if (!this.env.rightAngles) total += m.boxMargin.y;
      lineY = b.y + total;
      total += m.selfLoopAdvance;
      const dx = Math.max(m.half(g.label.width), m.half(m.width));
      const top = b.y - m.selfLoopRise + total;
      b.insert(g.startx - dx, top, g.stopx + dx, b.y + m.selfLoopAdvance + total);
    } else {
      total += m.boxMargin.y;
      lineY = b.y + total;
      b.insert(g.startx, lineY - m.messageRise, g.stopx, lineY);
    }
    b.bump(total);
    b.insert(g.fromBounds, starty, g.toBounds, b.y);
    return lineY;
  }

  /** v12 `adjustCreatedDestroyedData`: a creating or destroying message ends at the symbol. */
  private lifecycle(s: SequenceMessage, g: MessageX, starty: number, lineY: number): void {
    const { env, b } = this;
    const { m } = env;
    const from = env.columns.get(s.from) as Column;
    const to = env.columns.get(s.to) as Column;
    const stopy = b.y;
    const reach = (c: Column): number => stopy + m.half(c.height) + m.noteMargin.y;
    const halfSymbol = (c: Column): number =>
      m.symbolWidth > 0 && SYMBOL_KINDS.has(c.p.kind) ? m.half(m.symbolWidth) : m.half(c.width);
    const receiver = (c: Column, adjust: number): void => {
      if (c.x < from.x) b.insert(g.stopx - adjust, starty, g.startx, reach(c));
      else b.insert(g.startx, starty, g.stopx + adjust, reach(c));
      g.stopx += c.x < from.x ? adjust : -adjust;
    };
    const sender = (c: Column, adjust: number): void => {
      if (c.x < to.x) b.insert(g.startx - adjust, starty, g.stopx, reach(c));
      else b.insert(g.stopx, starty, g.startx + adjust, reach(c));
      g.startx += c.x < to.x ? adjust : -adjust;
    };
    const created = this.createdBy.get(s.ast);
    const destroyed = this.destroyedBy.get(s.ast);
    if (created && created.p.id === s.to) {
      receiver(created, halfSymbol(created) + m.createGap);
      created.top = lineY - m.half(created.height);
      // The next row starts below the symbol (v12: half the box, which a stick figure overhangs).
      b.bump(lifelineOffset(env, created) - m.half(created.height));
    } else if (destroyed && (destroyed.p.id === s.from || destroyed.p.id === s.to)) {
      if (env.mirror) {
        if (destroyed.p.id === s.from) sender(destroyed, halfSymbol(destroyed));
        else receiver(destroyed, halfSymbol(destroyed) + m.createGap);
      }
      destroyed.stopy = lineY - m.half(destroyed.height);
      b.bump(m.half(destroyed.height));
    }
  }

  private message(s: SequenceMessage): void {
    const g = this.geometry.messages.get(s);
    if (!g) return;
    const { m, seq } = this.env;
    const starty = this.b.y;
    const self = s.from === s.to;
    const lineY = this.boundMessage(g, self);
    this.lifecycle(s, g, starty, lineY);
    const span = [Math.min(g.startx, g.stopx), Math.max(g.startx, g.stopx)] as const;
    const label = g.label;
    const layout: MessageLayout = {
      ast: s.ast,
      from: s.from,
      to: s.to,
      arrow: s.arrow,
      y: lineY,
      startX: g.startx,
      stopX: g.stopx,
      ...(label.lines.length > 0
        ? {
            label: placed(
              label,
              alignX(this.env, seq.messageAlign, span, label.width, m.wrapPadding),
              starty + m.messageLead
            ),
          }
        : {}),
      ...(self ? { self: this.selfLoop(g, lineY) } : {}),
      ...(this.numbers ? { number: { value: this.seqIndex, x: this.numberX(s, g) } } : {}),
      ...(s.central ? { central: s.central } : {}),
    };
    this.messages.push(layout);
    // v12 rounds to two decimals against floating point drift.
    this.seqIndex = Math.round((this.seqIndex + this.seqStep) * 100) / 100;
    if (s.activation === 'activate') this.activate(s.to);
    else if (s.activation === 'deactivate') this.deactivate(s.from);
    if (s.central === 'to' || s.central === 'both') this.activate(s.to);
    if (s.central === 'from' || s.central === 'both') this.activate(s.from);
  }

  private selfLoop(g: MessageX, lineY: number): SelfLoop {
    const { m } = this.env;
    if (this.env.rightAngles)
      return {
        right: g.startx + Math.max(m.half(m.width), m.half(g.label.width)),
        bottom: lineY + m.selfLoopSquareDrop,
      };
    return { right: g.startx + m.selfLoopReach, bottom: lineY + m.selfLoopDrop };
  }

  /** The sequence number sits at the message's tail, or at its head for a reverse arrow. */
  private numberX(s: SequenceMessage, g: MessageX): number {
    const { m } = this.env;
    const left = g.fromBounds + m.lifelineHalf;
    if (s.from === s.to) return left;
    const ltr = g.startx <= g.stopx;
    return REVERSE_ARROWS.has(s.arrow) === ltr ? g.toBounds - m.lifelineHalf : left;
  }

  private note(s: SequenceNote): void {
    const g = this.geometry.notes.get(s);
    if (!g) return;
    const { b, env } = this;
    const { m } = env;
    b.bump(m.boxMargin.y);
    const y = b.y;
    const height = g.label.height + 2 * m.noteMargin.y;
    b.bump(height);
    b.insert(g.startx, y, g.startx + g.width, y + height);
    const span = [g.startx, g.startx + g.width] as const;
    this.notes.push({
      ast: s.ast,
      placement: s.placement,
      participants: s.participants,
      x: g.startx,
      y,
      width: g.width,
      height,
      label: placed(
        g.label,
        alignX(env, env.seq.noteAlign, span, g.label.width, m.noteMargin.x),
        y + m.half(height - g.label.height)
      ),
    });
  }

  /** Closes a frame: it reaches past its last row and holds its tab. */
  private closeFrame(frame: OpenFrame, minWidth: number, minHeight: number): Rect {
    const { b } = this;
    b.close();
    const empty = frame.startx === undefined || frame.stopx === undefined;
    const [sx, stopx] = empty
      ? columnSpan(this.env)
      : [frame.startx as number, frame.stopx as number];
    const ex = Math.max(stopx, sx + minWidth);
    const sy = frame.starty;
    const ey = Math.max(frame.stopy ?? b.y, b.y, sy + minHeight);
    // Frames around this one hold what this one grew by.
    if (empty || ex !== frame.stopx || ey !== frame.stopy) b.insert(sx, sy, ex, ey);
    b.bump(ey - b.y);
    return { x: sx, y: sy, width: ex - sx, height: ey - sy };
  }

  /** v12 wraps a fragment's titles, in brackets, to the fragment's reach. */
  private titleOf(label: string, s: SequenceFragment): MeasuredLabel | undefined {
    const reach = this.geometry.reach.get(s);
    if (label === '' || !reach) return undefined;
    const { m } = this.env;
    const max = Math.max(reach.width - 2 * m.wrapPadding, m.labelBoxWidth);
    return this.env.measure(`[${label}]`, this.env.fonts.message, max);
  }

  private fragment(s: SequenceFragment): void {
    const { b, env } = this;
    const { m } = env;
    const depth = b.frames.length;
    const titleRoom = (t: MeasuredLabel | undefined): number =>
      t ? Math.max(t.height, m.labelBoxHeight) : 0;
    b.bump(m.boxMargin.y);
    const frame = b.open();
    const title = this.titleOf(s.sections[0]?.label ?? '', s);
    b.bump(m.boxMargin.y + m.boxTextMargin.y + titleRoom(title));
    const index = this.fragments.length;
    this.fragments.length++;
    const sections: { ast?: AstId; y: number; text?: MeasuredLabel }[] = [];
    s.sections.forEach((section, i) => {
      if (i > 0) {
        b.bump(m.boxMargin.y + m.boxTextMargin.y);
        const text = this.titleOf(section.label, s);
        sections.push({ ...(section.ast !== undefined ? { ast: section.ast } : {}), y: b.y, text });
        b.bump(m.boxMargin.y + titleRoom(text));
      }
      this.statements(section.statements);
    });
    const kind = env.measure(TAB[s.fragment], env.fonts.message, Infinity);
    const tab = {
      width: Math.max(m.labelBoxWidth, kind.width + 2 * m.boxTextMargin.x),
      height: Math.max(m.labelBoxHeight, kind.height),
    };
    const r = this.closeFrame(frame, tab.width, tab.height);
    const textY = (y: number): number => y + m.boxMargin.y + m.boxTextMargin.y;
    this.fragments[index] = {
      ast: s.ast,
      kind: s.fragment,
      depth,
      ...r,
      tab: { x: r.x, y: r.y, ...tab, text: kind },
      ...(title
        ? {
            title: placed(
              title,
              r.x + m.half(m.labelBoxWidth) + m.half(r.width) - m.half(title.width),
              textY(r.y)
            ),
          }
        : {}),
      sections: sections.map((sec) => ({
        ...(sec.ast !== undefined ? { ast: sec.ast } : {}),
        y: sec.y,
        ...(sec.text
          ? { label: placed(sec.text, r.x + m.half(r.width - sec.text.width), textY(sec.y)) }
          : {}),
      })),
    };
  }

  private rect(s: SequenceRect): void {
    const { b } = this;
    const { m } = this.env;
    const depth = b.frames.length;
    b.bump(m.boxMargin.y);
    const frame = b.open();
    b.bump(m.boxMargin.y);
    const index = this.rects.length;
    this.rects.length++;
    this.statements(s.statements);
    const r = this.closeFrame(frame, 0, 0);
    this.rects[index] = { ast: s.ast, color: s.color, depth, ...r };
  }
}
