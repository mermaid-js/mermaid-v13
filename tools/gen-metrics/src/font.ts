// cspell:words cmap hhea hmtx
// Minimal TrueType reader: horizontal advances by code point (cmap format 4 + hmtx) and the
// hhea vertical metrics. Values are in thousandths of an em, rounded to integers.

export interface Face {
  /** Advance width of a code point, or undefined when the font has no glyph for it. */
  advance(code: number): number | undefined;
  vertical: { ascent: number; descent: number; lineGap: number };
}

export function readFace(bytes: Uint8Array): Face {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error('not a TrueType font');
  const tables = new Map<string, number>();
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    tables.set(tag, view.getUint32(at + 8));
  }
  const table = (tag: string): number => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`not a TrueType font: missing ${tag} table`);
    return at;
  };
  const head = table('head');
  const hhea = table('hhea');
  const hmtx = table('hmtx');
  const cmap = table('cmap');
  const unitsPerEm = view.getUint16(head + 18);
  const em = (units: number): number => Math.round((units * 1000) / unitsPerEm);
  const numHMetrics = view.getUint16(hhea + 34);

  let sub = -1;
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const rec = cmap + 4 + i * 8;
    const platform = view.getUint16(rec);
    const encoding = view.getUint16(rec + 2);
    const offset = cmap + view.getUint32(rec + 4);
    if (view.getUint16(offset) === 4 && (platform === 0 || (platform === 3 && encoding === 1))) {
      sub = offset;
    }
  }
  if (sub < 0) throw new Error('not a TrueType font: no format 4 cmap');
  const segX2 = view.getUint16(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;

  const glyphFor = (code: number): number => {
    for (let s = 0; s < segX2; s += 2) {
      if (view.getUint16(ends + s) < code) continue;
      const start = view.getUint16(starts + s);
      if (start > code) return 0;
      const delta = view.getInt16(deltas + s);
      const range = view.getUint16(ranges + s);
      if (range === 0) return (code + delta) & 0xffff;
      const glyph = view.getUint16(ranges + s + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  return {
    advance(code) {
      const glyph = glyphFor(code);
      if (glyph === 0) return undefined;
      return em(view.getUint16(hmtx + Math.min(glyph, numHMetrics - 1) * 4));
    },
    vertical: {
      ascent: em(view.getInt16(hhea + 4)),
      descent: em(-view.getInt16(hhea + 6)),
      lineGap: em(view.getInt16(hhea + 8)),
    },
  };
}
