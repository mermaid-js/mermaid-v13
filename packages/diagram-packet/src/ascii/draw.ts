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
  graphemes,
  type GlyphSet,
} from '@mermaid-js/core/ascii';
import { layoutLabel, Style, type InlineSpans, type MeasuredLabel } from '@mermaid-js/core/text';
import type { PacketModel, PacketPiece } from '../model.ts';

/** Columns a bit takes; a piece of `n` bits is `COLUMNS * n + 1` wide, borders included. */
const COLUMNS = 2;

export interface DrawOptions {
  readonly glyphs: GlyphSet;
  readonly showBits: boolean;
  readonly descending: boolean;
  /** `ascii.maxWidth`: a longer title wraps to it (or to the drawing, when that is wider). */
  readonly maxWidth?: number;
  readonly inline?: InlineSpans;
}

export interface Drawn {
  readonly text: string;
  /** Indices of the fields whose label is bold or italic, which text cannot show. */
  readonly emphasis: readonly number[];
}

/** The cell measurer ignores the font; one key serves every text. */
const FONT = { family: '', size: 1, weight: 400 } as const;

/** A label's lines as plain text (core label layout: entities decoded, `<br>` broken). */
function plainLines(label: MeasuredLabel): string[] {
  return label.lines.map((line) => line.map((r) => r.text).join(''));
}

const emphasised = (label: MeasuredLabel): boolean =>
  label.lines.some((line) => line.some((r) => (r.style & (Style.Bold | Style.Italic)) !== 0));

/** `text` cut to `width` cells, ending in `mark` when it was cut. */
function cut(text: string, width: number, mark: string): string {
  if (cellWidth(text) <= width) return text;
  let out = '';
  let used = 0;
  for (const g of graphemes(text)) {
    if (used + g.width > width - 1) break;
    out += g.text;
    used += g.width;
  }
  return out + mark;
}

interface Placed {
  readonly x: number;
  readonly text: string;
}

/** The bit numbers of one piece, as the SVG places them: one centred, or one at each end. */
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
  const mark = glyphs.name === 'unicode' ? '…' : '~';
  const canvas = new Canvas();
  const inline = options.inline ? { inline: options.inline } : {};
  const measured = new Map<number, string>();
  const emphasis: number[] = [];
  const labelOf = (field: number): string => {
    let text = measured.get(field);
    if (text === undefined) {
      const label = layoutLabel(model.fields[field]!.label, FONT, Infinity, cellMeasurer, inline);
      if (emphasised(label)) emphasis.push(field);
      // A label is one line in text: its lines join with a space.
      text = plainLines(label).join(' ').trim();
      measured.set(field, text);
    }
    return text;
  };

  // Without bit numbers the rows share their borders (one table); with them, a number line
  // sits above each row's boxes.
  const pitch = showBits ? 4 : 2;
  const top = showBits ? 1 : 0;
  model.rows.forEach((pieces, r) => {
    const y = r * pitch + top;
    let free = 0;
    const numbers: Placed[] = [];
    for (const p of pieces) {
      const bits = p.end - p.start + 1;
      const first = p.start % bitsPerRow;
      const column = descending ? bitsPerRow - first - bits : first;
      const x = column * COLUMNS;
      const width = COLUMNS * bits + 1;
      drawBox(canvas, glyphs, { x, y, width, height: 3 });
      const inner = width - 2;
      const label = cut(labelOf(p.field), inner, mark);
      if (label !== '')
        drawText(canvas, x + 1 + Math.floor((inner - cellWidth(label)) / 2), y + 1, label);
      if (showBits) numbers.push(...bitNumbers(p, x, descending));
    }
    // A number that would touch the one before it is left out, so two never read as one.
    numbers.sort((a, b) => a.x - b.x);
    for (const n of numbers) {
      if (n.x < free) continue;
      drawText(canvas, n.x, y - 1, n.text);
      free = n.x + n.text.length + 1;
    }
  });

  return { text: finish(canvas, model, options), emphasis };
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

/** The rows' text with the title centred under them. */
function finish(canvas: Canvas, model: PacketModel, options: DrawOptions): string {
  const body = canvas.toString();
  const lines = body === '' ? [] : body.split('\n');
  if (!model.title) return lines.join('\n');
  const inline = options.inline ? { inline: options.inline } : {};
  const title = layoutLabel(model.title, FONT, Infinity, cellMeasurer, inline);
  const width = Math.max(0, ...lines.map(cellWidth));
  const wrapped = plainLines(title).flatMap((line) => {
    const t = line.trim();
    return options.maxWidth === undefined ? [t] : wrap(t, Math.max(width, options.maxWidth));
  });
  const out = new Canvas();
  wrapped.forEach((line, i) =>
    drawText(out, Math.max(0, Math.floor((width - cellWidth(line)) / 2)), i, line)
  );
  return [...lines, ...out.toString().split('\n')].join('\n');
}
