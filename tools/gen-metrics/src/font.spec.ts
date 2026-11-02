import { describe, expect, it } from 'vitest';
import { readFace } from './font.ts';

// Builds a minimal sfnt with head, hhea, hmtx and a format 4 cmap. Glyph widths and the
// code-to-glyph mapping are given directly, so expected advances are known literals.
function buildFont(opts: {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  lineGap: number;
  advances: number[]; // by glyph id; numHMetrics = advances.length
  segments: { start: number; end: number; delta: number }[];
}): Uint8Array {
  const head = new DataView(new ArrayBuffer(54));
  head.setUint16(18, opts.unitsPerEm);
  const hhea = new DataView(new ArrayBuffer(36));
  hhea.setInt16(4, opts.ascender);
  hhea.setInt16(6, opts.descender);
  hhea.setInt16(8, opts.lineGap);
  hhea.setUint16(34, opts.advances.length);
  const hmtx = new DataView(new ArrayBuffer(opts.advances.length * 4));
  opts.advances.forEach((a, i) => hmtx.setUint16(i * 4, a));
  const segs = [...opts.segments, { start: 0xffff, end: 0xffff, delta: 1 }];
  const segX2 = segs.length * 2;
  const sub = new DataView(new ArrayBuffer(16 + segX2 * 4));
  sub.setUint16(0, 4);
  sub.setUint16(2, sub.byteLength);
  sub.setUint16(6, segX2);
  segs.forEach((s, i) => {
    sub.setUint16(14 + i * 2, s.end);
    sub.setUint16(16 + segX2 + i * 2, s.start);
    sub.setInt16(16 + segX2 * 2 + i * 2, s.delta);
    sub.setUint16(16 + segX2 * 3 + i * 2, 0);
  });
  const cmap = new DataView(new ArrayBuffer(12 + sub.byteLength));
  cmap.setUint16(2, 1);
  cmap.setUint16(4, 3);
  cmap.setUint16(6, 1);
  cmap.setUint32(8, 12);
  new Uint8Array(cmap.buffer).set(new Uint8Array(sub.buffer), 12);
  const tables: [string, DataView][] = [
    ['cmap', cmap],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
  ];
  const dirSize = 12 + tables.length * 16;
  const total = tables.reduce((n, [, t]) => n + t.byteLength, dirSize);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tables.length);
  let at = dirSize;
  tables.forEach(([tag, t], i) => {
    for (let k = 0; k < 4; k++) view.setUint8(12 + i * 16 + k, tag.charCodeAt(k));
    view.setUint32(12 + i * 16 + 8, at);
    view.setUint32(12 + i * 16 + 12, t.byteLength);
    out.set(new Uint8Array(t.buffer), at);
    at += t.byteLength;
  });
  return out;
}

describe('readFace', () => {
  const font = buildFont({
    unitsPerEm: 2048,
    ascender: 1854,
    descender: -434,
    lineGap: 67,
    advances: [1229, 569, 1139, 2048],
    // 'A'..'B' -> glyphs 1..2, 'é' -> glyph 3 (2048 is the last hmtx entry, reused beyond it)
    segments: [
      { start: 0x41, end: 0x42, delta: 1 - 0x41 },
      { start: 0xe9, end: 0xea, delta: 3 - 0xe9 },
    ],
  });

  it('reads advances in thousandths of an em by code point', () => {
    const face = readFace(font);
    expect(face.advance(0x41)).toBe(278); // 569 / 2048 * 1000
    expect(face.advance(0x42)).toBe(556); // 1139 / 2048 * 1000
    expect(face.advance(0xe9)).toBe(1000);
    expect(face.advance(0xea)).toBe(1000); // glyph 4 reuses the last long metric
  });

  it('reports unmapped code points as missing', () => {
    expect(readFace(font).advance(0x43)).toBeUndefined();
  });

  it('reads vertical metrics from hhea in thousandths of an em', () => {
    expect(readFace(font).vertical).toEqual({ ascent: 905, descent: 212, lineGap: 33 });
  });

  it('rejects data that is not a TrueType font', () => {
    expect(() => readFace(new Uint8Array(64))).toThrow(/not a TrueType/);
  });
});
