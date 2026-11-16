/**
 * The packet layout's invariants (spec #421 §Testing, R-LAYOUT-3): what every `PacketLayout`
 * must satisfy for the model it was laid out from. Empty when the layout is sound; each entry
 * names a broken rule.
 */
import type { PacketModel } from '../model.ts';
import { PACKET_METRICS as m } from './metrics.ts';
import type { PacketLayout, PacketPieceLayout, Rect } from './types.ts';
import { nonFinite as finite } from '@mermaid-js/shared/testing/layout-invariants';

/** Float tolerance of the checks. */
const EPS = 1e-6;

export function packetLayoutViolations(model: PacketModel, layout: PacketLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  const { options, rows } = layout;
  const { rowHeight, bitWidth, bitsPerRow, paddingX } = options;
  const descending = options.bitOrder === 'descending';
  const pitch = rowHeight + layout.paddingY;
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

  // The canvas: v12's width and height (renderer.ts:14-16).
  if (bitsPerRow !== model.bitsPerRow)
    out.push(`laid out with ${bitsPerRow} bits per row, the model has ${model.bitsPerRow}`);
  if (!near(layout.width, bitWidth * bitsPerRow + 2 * m.margin))
    out.push(`the canvas is ${layout.width} wide`);
  const height = pitch * (rows.length + 1) - (model.title ? 0 : rowHeight);
  if (!near(layout.height, height)) out.push(`the canvas is ${layout.height} tall, not ${height}`);

  // The model's rows and pieces, in order.
  if (rows.length !== model.rows.length)
    out.push(`${rows.length} rows for the model's ${model.rows.length}`);
  rows.forEach((row, r) => {
    const want = model.rows[r] ?? [];
    const got = row.pieces.map((p) => `${p.field}:${p.start}-${p.end}`).join();
    const wanted = want.map((p) => `${p.field}:${p.start}-${p.end}`).join();
    if (got !== wanted) out.push(`row ${r} has pieces ${got}, the model ${wanted}`);
    if (!near(row.y, r * pitch + layout.paddingY)) out.push(`row ${r} is at y ${row.y}`);

    let bits = 0;
    for (const p of row.pieces) {
      const name = `piece ${p.start}-${p.end}`;
      bits += p.end - p.start + 1;
      if (p.bits !== p.end - p.start + 1) out.push(`${name} counts ${p.bits} bits`);
      const { box } = p;
      const width = Math.max(0, p.bits * bitWidth - paddingX);
      if (!near(box.width, width)) out.push(`${name} is ${box.width} wide, not ${width}`);
      if (box.x < m.margin - EPS || box.x + box.width > layout.width - m.margin + EPS)
        out.push(`${name} is outside [1, ${layout.width - m.margin}]`);
      const first = p.start % bitsPerRow;
      const column = descending ? bitsPerRow - first - p.bits : first;
      if (!near(box.x, column * bitWidth + m.margin)) out.push(`${name} is at x ${box.x}`);
      if (!near(box.y, row.y) || !near(box.height, rowHeight))
        out.push(`${name} is not the row's height`);
      labelViolations(p, out);
      bitNumberViolations(p, row.y, options.showBits, descending, out);
    }
    if (bits > bitsPerRow) out.push(`row ${r} holds ${bits} bits, more than ${bitsPerRow}`);

    // Pieces apart, left to right.
    const byX = [...row.pieces].sort((a, b) => a.box.x - b.box.x);
    for (let i = 1; i < byX.length; i++) {
      const a = byX[i - 1]!.box;
      const b = byX[i]!.box;
      if (a.x + a.width > b.x + EPS) out.push(`row ${r}: pieces at x ${a.x} and ${b.x} overlap`);
    }
  });

  coverViolations(model, layout, out);
  titleViolations(model, layout, out);

  // Everything drawn inside the bounds (D344), which hold v12's viewBox.
  const b = layout.bounds;
  const inside = (r: Rect, what: string): void => {
    if (
      r.x < b.x - EPS ||
      r.y < b.y - EPS ||
      r.x + r.width > b.x + b.width + EPS ||
      r.y + r.height > b.y + b.height + EPS
    )
      out.push(`${what} is outside the bounds`);
  };
  inside({ x: 0, y: 0, width: layout.width, height: layout.height }, "v12's viewBox");
  const half = layout.strokeWidth / 2;
  for (const row of rows)
    for (const p of row.pieces) {
      const r = p.box;
      const name = `piece ${p.start}-${p.end}`;
      inside(
        { x: r.x - half, y: r.y - half, width: r.width + 2 * half, height: r.height + 2 * half },
        name
      );
      inside(p.label, `${name}'s label`);
      for (const n of p.bitNumbers) inside(n.box, `${name}'s bit number ${n.text}`);
    }
  if (layout.title) inside(layout.title, 'the title');
  return out;
}

/** The label centred on its piece, in a font no larger than the labels' and no smaller than the bits'. */
function labelViolations(p: PacketPieceLayout, out: string[]): void {
  const { box, label } = p;
  if (
    Math.abs(label.x + label.width / 2 - (box.x + box.width / 2)) > EPS ||
    Math.abs(label.y + label.height / 2 - (box.y + box.height / 2)) > EPS
  )
    out.push(`piece ${p.start}-${p.end}'s label is not centred on it`);
  if (label.width !== label.text.width || label.height !== label.text.height)
    out.push(`piece ${p.start}-${p.end}'s label box is not its measured size`);
}

/** v12's bit numbers: none without `showBits`, one centred for one bit, else both ends. */
function bitNumberViolations(
  p: PacketPieceLayout,
  rowY: number,
  showBits: boolean,
  descending: boolean,
  out: string[]
): void {
  const name = `piece ${p.start}-${p.end}`;
  const { box } = p;
  const [leading, trailing] = descending ? [p.end, p.start] : [p.start, p.end];
  const ends: readonly (readonly [number, number, string])[] = [
    [leading, box.x, 'start'],
    [trailing, box.x + box.width, 'end'],
  ];
  const one: readonly (readonly [number, number, string])[] = [
    [leading, box.x + box.width / 2, 'middle'],
  ];
  let want = p.bits === 1 ? one : ends;
  if (!showBits) want = [];
  const got = p.bitNumbers.map((n) => `${n.text}@${n.x}/${n.anchor}`).join();
  const wanted = want.map(([bit, x, a]) => `${bit}@${x}/${a}`).join();
  if (got !== wanted) out.push(`${name} has bit numbers ${got}, not ${wanted}`);
  for (const n of p.bitNumbers) {
    if (n.text !== String(n.bit)) out.push(`${name}'s bit number ${n.text} reads ${n.bit}`);
    if (Math.abs(n.y - (rowY - m.bitNumberGap)) > EPS)
      out.push(`${name}'s bit number ${n.text} is at y ${n.y}`);
  }
}

/**
 * Each field's pieces cover its bits exactly, in order across the rows. The one exception is the
 * field the 10,000-row cap cut part-way (D342): it keeps its written end, and only a model with
 * `PACKET_TRUNCATED` may have it, as the last field drawn.
 */
function coverViolations(model: PacketModel, layout: PacketLayout, out: string[]): void {
  const byField = new Map<number, PacketPieceLayout[]>();
  let last: number | undefined;
  for (const row of layout.rows)
    for (const p of row.pieces) {
      const own = byField.get(p.field);
      if (own) own.push(p);
      else byField.set(p.field, [p]);
      last = p.field;
    }
  const truncated = model.warnings.some((w) => w.code === 'PACKET_TRUNCATED');
  model.fields.forEach((f, i) => {
    const own = byField.get(i) ?? [];
    if (own.length === 0) {
      out.push(`field ${f.start}-${f.end} has no pieces`);
      return;
    }
    let at = f.start;
    for (const p of own) {
      if (p.start !== at)
        out.push(`field ${f.start}-${f.end}: a piece starts at ${p.start}, not ${at}`);
      if (p.ast !== f.astId) out.push(`field ${f.start}-${f.end}: a piece has ast ${p.ast}`);
      at = p.end + 1;
    }
    const cut = truncated && i === last && at <= f.end;
    if (at !== f.end + 1 && !cut)
      out.push(`field ${f.start}-${f.end}'s pieces cover ${f.start}-${at - 1}`);
    own.forEach((p, k) => {
      if (p.first !== (k === 0))
        out.push(`field ${f.start}-${f.end}: piece ${k} first is ${p.first}`);
    });
  });
}

/**
 * The title: there iff the model has one, centred, its first line on v12's point unless that
 * would put its box over the last row, and its box below the last row's bottom.
 */
function titleViolations(model: PacketModel, layout: PacketLayout, out: string[]): void {
  const { title } = layout;
  if (!model.title !== !title) out.push(`the title is ${title ? 'drawn' : 'missing'}`);
  if (!title) return;
  if (Math.abs(title.x + title.width / 2 - layout.width / 2) > EPS)
    out.push('the title is not centred on the canvas');
  const lastRow = layout.rows[layout.rows.length - 1];
  const bottom = lastRow ? lastRow.y + layout.options.rowHeight : -Infinity;
  if (title.y < bottom - EPS)
    out.push(`the title's top ${title.y} is above the last row's bottom ${bottom}`);
  const pitch = layout.options.rowHeight + layout.paddingY;
  const middle = title.y + title.text.lineHeight / 2;
  const want = Math.max(layout.height - pitch / 2, bottom + title.text.lineHeight / 2);
  if (Math.abs(middle - want) > EPS) out.push(`the title's first line is centred at y ${middle}`);
}
