/**
 * The packet custom layout (spec #421 T3, `layoutKind: 'custom'`): `PacketModel` in,
 * `PacketLayout` out. It follows v12's `renderer.ts` with the drawing taken out: every label,
 * bit number and the title is measured first through the injected measurer, in `fontFamily`
 * (pitfall 16), then placed where v12 put it. Positions never depend on the measurements: they
 * only shrink a label that is wider than its piece (D343) and grow the bounds (D344). Every
 * length comes from the metrics table, the checked config or the theme (pitfall 13).
 *
 * v12 bugs fixed on the way: a `paddingX` wider than a piece no longer gives a negative width
 * (D342), and the viewBox no longer clips a title or label that runs past it (D344).
 */
import type { RenderContext } from '@mermaid-js/core';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import { packetConfig } from '../config.ts';
import type { PacketModel, PacketPiece } from '../model.ts';
import { FIT_STEPS, NORMAL_WEIGHT, PACKET_METRICS as m, packetThemeLength } from './metrics.ts';
import type {
  BitNumber,
  PacketLayout,
  PacketPieceLayout,
  PacketRowLayout,
  PlacedLabel,
  Rect,
} from './types.ts';

/** What the layout reads from the render context. */
export type PacketLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline'>>;

/** Lays out a packet diagram in px. */
export function layoutPacket(model: PacketModel, ctx: PacketLayoutContext): PacketLayout {
  // The parse already warned about each option it could not use (`PACKET_CONFIG_INVALID`).
  const checked = packetConfig(ctx.config.packet ?? {}).config;
  const options = { ...checked, bitsPerRow: model.bitsPerRow };
  const { rowHeight, bitWidth, bitsPerRow, paddingX, showBits } = options;
  const descending = options.bitOrder === 'descending';
  const pY = options.paddingY + (showBits ? m.bitsPadding : 0);
  const pitch = rowHeight + pY;

  const family = ctx.theme.value('fontFamily');
  const font = (size: number): FontKey => ({ family, size, weight: NORMAL_WEIGHT });
  const fonts = {
    label: font(packetThemeLength(ctx.theme, 'packetLabelFontSize')),
    byte: font(packetThemeLength(ctx.theme, 'packetByteFontSize')),
    title: font(packetThemeLength(ctx.theme, 'packetTitleFontSize')),
  };
  const strokeWidth = packetThemeLength(ctx.theme, 'packetBlockStrokeWidth');
  const inline = ctx.inline ? { inline: ctx.inline } : {};
  const measure = (text: string, f: FontKey): MeasuredLabel =>
    layoutLabel(text, f, Infinity, ctx.measurer, inline);
  const { ascent, descent } = ctx.measurer.metrics(fonts.byte);

  /** A label in a piece `width` wide, shrunk to fit down to the bit-number size (D343). */
  const fitted = (text: string, width: number): { text: MeasuredLabel; font: FontKey } => {
    let f = fonts.label;
    let t = measure(text, f);
    const min = Math.min(fonts.label.size, fonts.byte.size);
    // Scale by the overflow; a measurer need not scale with the size, so the last step is the
    // floor itself, and a label that still does not fit overflows at the bit-number size.
    for (let i = 1; t.width > width && f.size > min; i++) {
      const scaled = (f.size * Math.max(width, 0)) / t.width;
      f = font(i < FIT_STEPS ? Math.max(min, scaled) : min);
      t = measure(text, f);
    }
    return { text: t, font: f };
  };

  const bitNumber = (
    bit: number,
    role: BitNumber['role'],
    x: number,
    y: number,
    anchor: BitNumber['anchor']
  ): BitNumber => {
    const text = String(bit);
    const w = ctx.measurer.width(text, fonts.byte, 0);
    const left = x - w * ANCHOR_SHARE[anchor];
    return {
      text,
      bit,
      role,
      x,
      y,
      anchor,
      box: { x: left, y: y - ascent, width: w, height: ascent + descent },
    };
  };

  const firstPiece = new Set<number>();
  const piece = (p: PacketPiece, rowY: number): PacketPieceLayout => {
    const f = model.fields[p.field]!;
    const bits = p.end - p.start + 1;
    const first = p.start % bitsPerRow;
    const column = descending ? bitsPerRow - first - bits : first;
    const x = column * bitWidth + m.margin;
    const width = Math.max(0, bits * bitWidth - paddingX);
    const box: Rect = { x, y: rowY, width, height: rowHeight };
    const label = fitted(f.label, width);
    const cx = x + width / 2;
    const cy = rowY + rowHeight / 2;
    const placed: PlacedLabel = {
      x: cx - label.text.width / 2,
      y: cy - label.text.height / 2,
      width: label.text.width,
      height: label.text.height,
      ...label,
    };
    const bitNumbers: BitNumber[] = [];
    if (showBits) {
      const y = rowY - m.bitNumberGap;
      const [leading, trailing] = descending ? [p.end, p.start] : [p.start, p.end];
      if (bits === 1) bitNumbers.push(bitNumber(leading, 'start', cx, y, 'middle'));
      else {
        bitNumbers.push(bitNumber(leading, 'start', x, y, 'start'));
        bitNumbers.push(bitNumber(trailing, 'end', x + width, y, 'end'));
      }
    }
    const isFirst = !firstPiece.has(p.field);
    firstPiece.add(p.field);
    return {
      field: p.field,
      ast: f.astId,
      first: isFirst,
      start: p.start,
      end: p.end,
      bits,
      box,
      label: placed,
      bitNumbers,
    };
  };

  const rows: PacketRowLayout[] = model.rows.map((pieces, r) => {
    const y = r * pitch + pY;
    return { y, pieces: pieces.map((p) => piece(p, y)) };
  });

  const width = bitWidth * bitsPerRow + 2 * m.margin;
  const height = pitch * (rows.length + 1) - (model.title ? 0 : rowHeight);

  // The title's first line is centred where v12 centred its one line; more lines grow down. A
  // title taller than the row pitch moves down to sit on the last row instead of over it, the
  // one place a measurement moves something (output changes only where v12 overlapped).
  let title: PlacedLabel | undefined;
  if (model.title) {
    const text = measure(model.title, fonts.title);
    const bottom = rows.length > 0 ? rows[rows.length - 1]!.y + rowHeight : -Infinity;
    const y = Math.max(height - pitch / 2 - text.lineHeight / 2, bottom);
    title = {
      x: width / 2 - text.width / 2,
      y,
      width: text.width,
      height: text.height,
      text,
      font: fonts.title,
    };
  }

  const box = new Box();
  box.add({ x: 0, y: 0, width, height });
  const half = strokeWidth / 2;
  for (const row of rows)
    for (const p of row.pieces) {
      const b = p.box;
      box.add({
        x: b.x - half,
        y: b.y - half,
        width: b.width + strokeWidth,
        height: b.height + strokeWidth,
      });
      box.add(p.label);
      for (const n of p.bitNumbers) box.add(n.box);
    }
  if (title) box.add(title);

  return {
    width,
    height,
    options,
    paddingY: pY,
    rows,
    ...(title ? { title } : {}),
    strokeWidth,
    fonts,
    bounds: box.rect(),
  };
}

/** How much of a text's width lies left of its anchor. */
const ANCHOR_SHARE: Readonly<Record<BitNumber['anchor'], number>> = {
  start: 0,
  middle: 1 / 2,
  end: 1,
};

/** The union of what is drawn. */
class Box {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add(r: Rect): void {
    this.x0 = Math.min(this.x0, r.x);
    this.y0 = Math.min(this.y0, r.y);
    this.x1 = Math.max(this.x1, r.x + r.width);
    this.y1 = Math.max(this.y1, r.y + r.height);
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}
