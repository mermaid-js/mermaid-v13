// cspell:words Grooff
// Draws a sequence layout computed in cells onto the text grid (D100, D108, D82): participant
// boxes with their lifelines, activation bars as heavy lifelines, fragment frames with the
// keyword tab on the top border and dashed section dividers, message lines with their heads,
// self loops, notes as boxes, and every label last so lines never cut through text.
// Two forms follow mermaid-ascii's sequence renderer (Alexander Grooff, pkg/sequence/charset.go
// at 5a9df15): an activation drawn as the lifeline made heavy, and the async heads `(` and `)`.
// No code is taken from it: this draws v13's own cell layout with core's text-grid kit, whose
// mermaid-ascii port core's THIRD_PARTY_NOTICES lists.
import {
  armOf,
  Canvas,
  cellWidth,
  DOWN,
  drawBox,
  drawText,
  glyphFor,
  LEFT,
  RIGHT,
  sideOf,
  UP,
  type BoxOptions,
  type CellRect,
  type Dir,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { ArrowKind } from '../model.ts';
import type {
  MessageLayout,
  ParticipantLayout,
  PlacedLabel,
  Rect,
  SequenceLayout,
} from '../layout/index.ts';
import { symbolForm } from './symbols.ts';

/** A head drawn in one cell: v12's marker families, in text. */
type Head = 'arrow' | 'open' | 'cross' | 'top' | 'bottom';

/** The head at the line's end (v12 `marker-end`). */
const END: Partial<Record<ArrowKind, Head>> = {
  solid: 'arrow',
  dotted: 'arrow',
  bidirectional_solid: 'arrow',
  bidirectional_dotted: 'arrow',
  solid_point: 'open',
  dotted_point: 'open',
  solid_cross: 'cross',
  dotted_cross: 'cross',
  solid_top: 'top',
  solid_top_dotted: 'top',
  stick_top: 'top',
  stick_top_dotted: 'top',
  solid_bottom: 'bottom',
  solid_bottom_dotted: 'bottom',
  stick_bottom: 'bottom',
  stick_bottom_dotted: 'bottom',
};

/** The head at the line's start (v12 `marker-start`, turned back along the line). */
const START: Partial<Record<ArrowKind, Head>> = {
  bidirectional_solid: 'arrow',
  bidirectional_dotted: 'arrow',
  solid_arrow_top_reverse: 'bottom',
  solid_arrow_top_reverse_dotted: 'bottom',
  stick_arrow_top_reverse: 'bottom',
  stick_arrow_top_reverse_dotted: 'bottom',
  solid_arrow_bottom_reverse: 'top',
  solid_arrow_bottom_reverse_dotted: 'top',
  stick_arrow_bottom_reverse: 'top',
  stick_arrow_bottom_reverse_dotted: 'top',
};

// Heads the glyph sets have no entry for: the async head (as mermaid-ascii draws it) and the
// half heads as harpoons, barb up (`top`) or down (`bottom`); ASCII has only `<` and `>`.
const OPEN = { left: '(', right: ')' } as const;
const HARPOON = {
  top: { left: '↼', right: '⇀' },
  bottom: { left: '↽', right: '⇁' },
} as const;

function headGlyph(glyphs: GlyphSet, head: Head, d: Dir): string {
  const side = d === LEFT ? 'left' : 'right';
  switch (head) {
    case 'arrow':
      return sideOf(glyphs.head, d);
    case 'cross':
      return glyphs.cross;
    case 'open':
      return OPEN[side];
    case 'top':
    case 'bottom':
      return glyphs.name === 'unicode' ? HARPOON[head][side] : sideOf(glyphs.head, d);
  }
}

interface Cell {
  readonly x: number;
  readonly y: number;
}

const dirOf = (a: Cell, b: Cell): Dir => {
  if (b.x !== a.x) return b.x > a.x ? RIGHT : LEFT;
  return b.y > a.y ? DOWN : UP;
};

/**
 * Draws a run of cells as one line: each cell gets arms to its neighbours, the ends also the
 * arm that carries the line on, so a straight run is `─` to the end and a turn is a corner.
 */
function drawRun(canvas: Canvas, glyphs: GlyphSet, cells: readonly Cell[], dotted: boolean): void {
  const last = cells.length - 1;
  cells.forEach((c, i) => {
    let arms = 0;
    if (i > 0) arms |= armOf(dirOf(c, cells[i - 1]!), 1);
    if (i < last) arms |= armOf(dirOf(c, cells[i + 1]!), 1);
    if (i === 0 && last > 0) arms |= armOf(dirOf(cells[1]!, c), 1);
    if (i === last && last > 0) arms |= armOf(dirOf(cells[last - 1]!, c), 1);
    if (last === 0) arms = armOf(LEFT, 1) | armOf(RIGHT, 1);
    let glyph = glyphFor(arms, glyphs);
    if (dotted && arms === (armOf(LEFT, 1) | armOf(RIGHT, 1))) glyph = glyphs.dotted.h;
    if (dotted && arms === (armOf(UP, 1) | armOf(DOWN, 1))) glyph = glyphs.dotted.v;
    if (glyph) canvas.draw(c.x, c.y, glyph);
  });
}

/** A one-armed stub merged into the line glyph at a cell: a lifeline becomes a tee. */
function stub(canvas: Canvas, glyphs: GlyphSet, x: number, y: number, d: Dir): void {
  if (canvas.get(x, y) === ' ') return;
  canvas.draw(x, y, glyphFor(armOf(d, 1), glyphs)!);
}

const row = (x1: number, x2: number, y: number): Cell[] => {
  const out: Cell[] = [];
  const step = x2 >= x1 ? 1 : -1;
  for (let x = x1; x !== x2 + step; x += step) out.push({ x, y });
  return out;
};

const textOf = (label: MeasuredLabel, i: number): string =>
  (label.lines[i] ?? []).map((r) => r.text).join('');

/** How the lines of a label sit in its box: `messageAlign` / `noteAlign`, else centred. */
export type Align = 'left' | 'center' | 'right';

/** Writes each line of a placed label in the label's width, aligned as `align` says. */
function writeLabel(canvas: Canvas, p: PlacedLabel, align: Align = 'center'): void {
  const { text } = p;
  text.lines.forEach((_, i) => {
    const line = textOf(text, i);
    const room = p.width - cellWidth(line);
    let x = p.x + Math.floor(room / 2);
    if (align === 'left') x = p.x;
    else if (align === 'right') x = p.x + room;
    drawText(canvas, x, p.y + i, line);
  });
}

/** Writes a label's lines centred in a row band `x … x + width − 1`, from row `y`. */
function writeCentred(canvas: Canvas, label: MeasuredLabel, x: number, width: number, y: number) {
  label.lines.forEach((_, i) => {
    const line = textOf(label, i);
    drawText(canvas, x + Math.floor((width - cellWidth(line)) / 2), y + i, line);
  });
}

/** The first column from which `length` cells of row `y` up to `to` are plain border. */
function plainRun(
  canvas: Canvas,
  glyphs: GlyphSet,
  from: number,
  to: number,
  y: number,
  length: number
): number | undefined {
  let run = 0;
  for (let x = from; x <= to; x++) {
    run = canvas.get(x, y) === glyphs.solid.h ? run + 1 : 0;
    if (run === length) return x - length + 1;
  }
  return undefined;
}

/** Clears a rectangle's cells to spaces (what a filled SVG shape hides). */
function clear(canvas: Canvas, r: CellRect): void {
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++) canvas.set(x, y, ' ');
}

/**
 * Writes `text` on a frame's top border from column `x`, with a space either side
 * (`┌─ text ──┐`) where that leaves the corners `left` and `right` standing.
 */
function onBorder(canvas: Canvas, x: number, y: number, text: string, left: number, right: number) {
  if (x - 1 > left) canvas.set(x - 1, y, ' ');
  const end = drawText(canvas, x, y, text);
  if (end < right) canvas.set(end, y, ' ');
}

class Drawing {
  readonly canvas = new Canvas();
  private readonly labels: (() => void)[] = [];
  private readonly columns: ReadonlyMap<string, ParticipantLayout>;
  // Layout coordinates may be negative (a box's margin left of the first column).
  private readonly dx: number;
  private readonly dy: number;

  constructor(
    private readonly layout: SequenceLayout,
    private readonly glyphs: GlyphSet,
    private readonly align: { readonly message: Align; readonly note: Align }
  ) {
    this.columns = new Map(layout.participants.map((p) => [p.id, p]));
    this.dx = -layout.bounds.x;
    this.dy = -layout.bounds.y;
  }
  private rect(r: Rect): CellRect {
    return { x: r.x + this.dx, y: r.y + this.dy, width: r.width, height: r.height };
  }
  private at(p: PlacedLabel): PlacedLabel {
    return { ...p, x: p.x + this.dx, y: p.y + this.dy };
  }

  draw(): string {
    this.boxes();
    this.lifelines();
    this.fragments();
    this.activations();
    for (const m of this.layout.messages) this.message(m);
    this.notes();
    this.participants();
    const { title } = this.layout;
    if (title) this.labels.push(() => writeLabel(this.canvas, this.at(title)));
    for (const label of this.labels) label();
    return this.canvas.toString();
  }

  private boxes(): void {
    for (const b of this.layout.boxes) {
      const r = this.rect(b);
      drawBox(this.canvas, this.glyphs, r);
      if (b.label) {
        const label = this.at(b.label);
        const right = r.x + r.width - 1;
        // Centred in the box as drawn, which may be narrower than the label's own room.
        const first = textOf(label.text, 0);
        const x = Math.max(r.x + 1, r.x + Math.floor((r.width - cellWidth(first)) / 2));
        this.labels.push(() => onBorder(this.canvas, x, r.y, first, r.x, right));
        for (let i = 1; i < label.text.lines.length; i++)
          this.labels.push(() =>
            drawText(this.canvas, label.x, label.y + i, textOf(label.text, i))
          );
      }
    }
  }

  private lifelines(): void {
    const { canvas, glyphs } = this;
    for (const p of this.layout.participants) {
      const x = p.lifeline.x + this.dx;
      for (let y = p.lifeline.y1 + this.dy; y < p.lifeline.y2 + this.dy; y++)
        canvas.draw(x, y, glyphs.dotted.v);
    }
  }

  // A bar is the lifeline drawn heavy from its first row to its last: a bar on a bar is one
  // column to the right, as v12 offsets it.
  private activations(): void {
    const heavy = glyphFor(armOf(UP, 2) | armOf(DOWN, 2), this.glyphs)!;
    for (const a of this.layout.activations) {
      const x = a.x + a.width - 1 + this.dx;
      // Only the lifeline turns heavy: a frame border the bar starts or ends on stays.
      for (let y = a.y + this.dy; y <= a.y + a.height + this.dy; y++) {
        const here = this.canvas.get(x, y);
        if (here === ' ' || here === this.glyphs.dotted.v || here === heavy)
          this.canvas.set(x, y, heavy);
      }
    }
  }

  private fragments(): void {
    const { canvas, glyphs } = this;
    for (const f of this.layout.fragments) {
      // A frame's edges are lines between cells: its border takes the cells on them, so the
      // last row and column it holds (a message line, a lifeline) stay inside.
      const r = { ...this.rect(f), width: f.width + 1, height: f.height + 1 };
      drawBox(canvas, glyphs, r);
      const right = r.x + r.width - 1;
      for (const s of f.sections) {
        const y = s.y + this.dy;
        if (r.width > 2) drawRun(canvas, glyphs, row(r.x + 1, right - 1, y), true);
        stub(canvas, glyphs, r.x, y, RIGHT);
        stub(canvas, glyphs, right, y, LEFT);
        if (s.label) {
          const label = this.at(s.label);
          this.labels.push(() => writeLabel(canvas, label));
        }
      }
      const tab = this.at(f.tab);
      // The keyword goes on the first stretch of plain border it fits, so the lifeline
      // crossings (`┼`) stay; on none, right after the corner.
      const keyword = textOf(tab.text, 0);
      this.labels.push(() => {
        const at = plainRun(canvas, glyphs, r.x + 1, right - 1, r.y, cellWidth(keyword) + 2);
        onBorder(canvas, (at ?? r.x + 1) + 1, r.y, keyword, r.x, right);
      });
      if (f.title) {
        const title = this.at(f.title);
        this.labels.push(() => writeLabel(canvas, title));
      }
    }
  }

  private message(m: MessageLayout): void {
    if (m.self) this.selfLoop(m, m.self);
    else this.line(m);
    // The layout put the sequence number in front of the label (`1. Hello`).
    if (m.label) {
      const label = this.at(m.label);
      this.labels.push(() => writeLabel(this.canvas, label, this.align.message));
    }
  }

  /** A self message: out along its row, down, and back to the lifeline. */
  private selfLoop(m: MessageLayout, self: NonNullable<MessageLayout['self']>): void {
    const { canvas, glyphs } = this;
    const y = m.y + this.dy;
    const startX = m.startX + this.dx;
    const end = END[m.arrow];
    const start = START[m.arrow];
    const right = self.right + this.dx;
    const bottom = self.bottom + this.dy;
    const lifeline = (this.columns.get(m.from)?.lifeline.x ?? m.startX - 1) + this.dx;
    // A central circle sits on the lifeline; the loop leaves from the cell next to it.
    const first = m.central ? lifeline + 1 : startX;
    const cells: Cell[] = [...row(first, right, y)];
    for (let j = y + 1; j <= bottom; j++) cells.push({ x: right, y: j });
    cells.push(...row(right - 1, first, bottom));
    drawRun(canvas, glyphs, cells, m.arrow.includes('dotted'));
    // `A()->>A` leaves from a circle, `A->>()A` comes back to one (mermaid-ascii: both rows).
    const fromCircle = m.central === 'from' || m.central === 'both';
    const toCircle = m.central === 'to' || m.central === 'both';
    if (fromCircle) canvas.set(lifeline, y, glyphs.circle);
    else stub(canvas, glyphs, first - 1, y, RIGHT);
    if (toCircle) canvas.set(lifeline, bottom, glyphs.circle);
    if (end) canvas.set(first, bottom, headGlyph(glyphs, end, LEFT));
    if (start) canvas.set(first, y, headGlyph(glyphs, start, LEFT));
  }

  /** A message between two lifelines, with its heads and central circles. */
  private line(m: MessageLayout): void {
    const { canvas, glyphs } = this;
    const y = m.y + this.dy;
    const startX = m.startX + this.dx;
    const stopX = m.stopX + this.dx;
    const dotted = m.arrow.includes('dotted');
    const end = END[m.arrow];
    const start = START[m.arrow];
    const d = stopX >= startX ? RIGHT : LEFT;
    const step = d === RIGHT ? 1 : -1;
    const from = this.columns.get(m.from);
    const to = this.columns.get(m.to);
    const fromCircle = m.central === 'from' || m.central === 'both';
    const toCircle = m.central === 'to' || m.central === 'both';
    // A circle sits on the lifeline, so the line runs from the cell next to it.
    const first = fromCircle && from ? from.lifeline.x + this.dx + step : startX;
    drawRun(canvas, glyphs, row(first, stopX, y), dotted);
    if (!fromCircle) stub(canvas, glyphs, first - step, y, d);
    if (end) canvas.set(stopX, y, headGlyph(glyphs, end, d));
    if (start) canvas.set(first, y, headGlyph(glyphs, start, d === RIGHT ? LEFT : RIGHT));
    if (fromCircle && from) canvas.set(from.lifeline.x + this.dx, y, glyphs.circle);
    if (toCircle && to) canvas.set(to.lifeline.x + this.dx, y, glyphs.circle);
  }

  private notes(): void {
    const { canvas, glyphs } = this;
    for (const n of this.layout.notes) {
      const r = this.rect(n);
      clear(canvas, r);
      drawBox(canvas, glyphs, r);
      const label = this.at(n.label);
      this.labels.push(() => writeLabel(canvas, label, this.align.note));
    }
  }

  private participants(): void {
    const { canvas, glyphs } = this;
    for (const p of this.layout.participants) {
      const options: BoxOptions = symbolForm(p.kind) ?? {};
      const x = p.x + this.dx;
      const lifeline = p.lifeline.x + this.dx;
      const box = (top: number, joint: Dir): void => {
        const r = { x, y: top, width: p.width, height: p.height };
        clear(canvas, r);
        drawBox(canvas, glyphs, r, options);
        const border = joint === DOWN ? top + p.height - 1 : top;
        const outside = joint === DOWN ? border + 1 : border - 1;
        if (canvas.get(lifeline, outside) !== ' ')
          canvas.draw(lifeline, border, glyphFor(armOf(joint, 1), glyphs)!);
        const rows = p.label.lines.length;
        writeCentred(canvas, p.label, x, p.width, top + p.labelY - Math.floor(rows / 2));
      };
      box(p.top + this.dy, DOWN);
      if (p.bottom !== undefined) box(p.bottom + this.dy, UP);
    }
  }
}

export interface DrawOptions {
  /** The front-matter title, for a diagram with no `title` statement of its own. */
  readonly title?: string;
  readonly messageAlign?: Align;
  readonly noteAlign?: Align;
}

/**
 * Draws a sequence layout in cells. Returns the text: `\n` line ends, no trailing spaces, the
 * empty margin around the drawing trimmed, and `title` (the front-matter title, when the
 * diagram has no `title` statement of its own) centred on the first line.
 */
export function drawSequence(
  layout: SequenceLayout,
  glyphs: GlyphSet,
  options: DrawOptions = {}
): string {
  const align = { message: options.messageAlign ?? 'center', note: options.noteAlign ?? 'center' };
  let lines = new Drawing(layout, glyphs, align).draw().split('\n');
  const title = options.title;
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const margin = Math.min(...lines.filter((l) => l !== '').map((l) => l.search(/\S/)));
  if (margin > 0 && Number.isFinite(margin)) lines = lines.map((l) => l.slice(margin));
  const text = title?.trim();
  if (text) {
    const width = Math.max(0, ...lines.map(cellWidth));
    const out = new Canvas();
    drawText(out, Math.max(0, Math.floor((width - cellWidth(text)) / 2)), 0, text);
    lines.unshift(out.toString(), '');
  }
  return lines.join('\n');
}
