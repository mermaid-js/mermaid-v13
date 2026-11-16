// Draws a packet diagram on the text grid (D347): each row a run of boxes sharing borders, two
// columns a bit (32 bits give 65 columns), the rows one table when there are no bit numbers and
// apart when a line of them sits above each row; the title centred below. Junctions come from
// the canvas merging what is drawn (`junction`).
import {
  Canvas,
  cellMeasurer,
  cellWidth,
  drawBox,
  drawText,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import type { CellPadding } from '@mermaid-js/core/layout';
import {
  layoutLabel,
  type InlineSpans,
  type LabelOptions,
  type MeasuredLabel,
} from '@mermaid-js/core/text';
import type { PacketModel, PacketPiece } from '../model.ts';
import { cut, emphasised } from '@mermaid-js/shared/ascii';

/** Columns a bit takes; a piece of `n` bits is `COLUMNS * n + 1` wide, borders included. */
const COLUMNS = 2;

export interface DrawOptions {
  readonly glyphs: GlyphSet;
  readonly showBits: boolean;
  readonly descending: boolean;
  /** `ascii.padding` (D77): `roomy` puts a blank line above and below each label. */
  readonly padding: CellPadding;
  /** `ascii.maxWidth`: a longer title wraps to it (or to the drawing, when that is wider). */
  readonly maxWidth?: number;
  readonly inline?: InlineSpans;
}

/** What text cannot show of the bold and italic it was given. */
export interface Emphasis {
  /** Indices of the fields whose label is bold or italic. */
  readonly fields: readonly number[];
  /** Whether the title is. */
  readonly title: boolean;
}

export interface Drawn {
  readonly text: string;
  readonly emphasis: Emphasis;
}

/** The cell measurer ignores the font; one key serves every text. */
const FONT = { family: '', size: 1, weight: 400 } as const;

/** A label's lines as plain text (core label layout: entities decoded, `<br>` broken). */
function plainLines(label: MeasuredLabel): string[] {
  return label.lines.map((line) => line.map((r) => r.text).join(''));
}

interface Placed {
  readonly x: number;
  readonly text: string;
}

/**
 * The bit numbers of one piece, where the SVG puts them: a one-bit piece's number centred over
 * its cell, a wider piece's leading bit from its first cell and trailing bit up to its last.
 */
function bitNumbers(p: PacketPiece, x: number, descending: boolean): Placed[] {
  const bits = p.end - p.start + 1;
  const [leading, trailing] = descending ? [p.end, p.start] : [p.start, p.end];
  const first = x + 1;
  const last = x + COLUMNS * bits - 1;
  if (bits === 1) {
    const t = String(leading);
    return [{ x: Math.max(0, first - Math.floor((t.length - 1) / 2)), text: t }];
  }
  const t = String(trailing);
  return [
    { x: first, text: String(leading) },
    { x: last - t.length + 1, text: t },
  ];
}

/** Draws `model`; returns the text and what it could not show. */
export function drawPacket(model: PacketModel, options: DrawOptions): Drawn {
  const { glyphs, showBits, descending } = options;
  const { bitsPerRow } = model;
  // Core's glyph sets have no ellipsis; `~` keeps the `ascii` charset pure ASCII.
  const mark = glyphs.name === 'unicode' ? '…' : '~';
  const labelOptions: LabelOptions = options.inline ? { inline: options.inline } : {};
  const measure = (text: string): MeasuredLabel =>
    layoutLabel(text, FONT, Infinity, cellMeasurer, labelOptions);
  const labels = model.fields.map((f) => measure(f.label));
  const title = model.title ? measure(model.title) : undefined;
  const emphasis: Emphasis = {
    fields: labels.flatMap((l, i) => (emphasised(l) ? [i] : [])),
    title: title !== undefined && emphasised(title),
  };
  // A label is one line in text: its lines join with a space.
  const labelText = labels.map((l) => plainLines(l).join(' ').trim());

  const labelPad = options.padding === 'roomy' ? 1 : 0;
  const boxHeight = 3 + 2 * labelPad;
  // Without bit numbers the rows share their borders (one table); with them, a number line
  // sits above each row's boxes.
  const rowStride = showBits ? boxHeight + 1 : boxHeight - 1;
  const firstBoxLine = showBits ? 1 : 0;
  const canvas = new Canvas();
  model.rows.forEach((pieces, r) => {
    const y = r * rowStride + firstBoxLine;
    const numbers: Placed[] = [];
    for (const p of pieces) {
      const bits = p.end - p.start + 1;
      const first = p.start % bitsPerRow;
      const column = descending ? bitsPerRow - first - bits : first;
      const x = column * COLUMNS;
      const width = COLUMNS * bits + 1;
      drawBox(canvas, glyphs, { x, y, width, height: boxHeight });
      const inner = width - 2;
      const label = cut(labelText[p.field]!, inner, mark);
      if (label !== '') {
        const left = x + 1 + Math.floor((inner - cellWidth(label)) / 2);
        drawText(canvas, left, y + 1 + labelPad, label);
      }
      if (showBits) numbers.push(...bitNumbers(p, x, descending));
    }
    // Left to right, a number that would touch or overlap the one drawn before it is left out,
    // so two never read as one: the next may start only after a blank column.
    numbers.sort((a, b) => a.x - b.x);
    let nextFree = 0;
    for (const n of numbers) {
      if (n.x < nextFree) continue;
      drawText(canvas, n.x, y - 1, n.text);
      nextFree = n.x + n.text.length + 1;
    }
  });

  return { text: finish(canvas, title, options.maxWidth), emphasis };
}

// Greedy word wrap to `width` cells; a word longer than that keeps a line of its own.
function wrap(text: string, width: number): string[] {
  if (cellWidth(text) <= width) return [text];
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && cellWidth(next) > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') out.push(line);
  return out;
}

/** The rows' text with the title's lines centred under them. */
function finish(canvas: Canvas, title: MeasuredLabel | undefined, maxWidth?: number): string {
  const body = canvas.toString();
  const lines = body === '' ? [] : body.split('\n');
  if (!title) return lines.join('\n');
  const width = Math.max(0, ...lines.map(cellWidth));
  const wrapped = plainLines(title).flatMap((line) => {
    const t = line.trim();
    return maxWidth === undefined ? [t] : wrap(t, Math.max(width, maxWidth));
  });
  const out = new Canvas();
  wrapped.forEach((line, i) =>
    drawText(out, Math.max(0, Math.floor((width - cellWidth(line)) / 2)), i, line)
  );
  return [...lines, ...out.toString().split('\n')].join('\n');
}
