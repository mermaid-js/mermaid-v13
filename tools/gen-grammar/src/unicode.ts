/**
 * Unicode id-letter table for the parser kit's `CharClass` (DESIGN §4.2): reads the
 * `UNICODE_TEXT` character class from v12's `flow.jison` and packs it as base-36 deltas.
 *
 * Packed format: space-separated pairs `gap len`, both base 36. Range i starts `gap` after
 * the end of range i-1 (0 for the first) and ends `len` after its start, inclusive.
 */

/** Pack the `UNICODE_TEXT` class of a flow.jison source. */
export function packUnicodeLetters(jison: string): string {
  const end = jison.indexOf("return 'UNICODE_TEXT'");
  if (end < 0) throw new Error("flow.jison: no rule returning 'UNICODE_TEXT'");
  // The class is the run of `[…]` lines just before the action.
  const lines = jison.slice(0, end).split('\n');
  const block: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] ?? '').trim();
    if (line === '' && block.length === 0) continue;
    if (!line.startsWith('[')) break;
    block.push(line);
  }
  const ranges: [number, number][] = [];
  for (const m of block.join('').matchAll(/\\u([0-9A-Fa-f]{4})(?:-\\u([0-9A-Fa-f]{4}))?/g)) {
    const a = parseInt(m[1] ?? '', 16);
    ranges.push([a, m[2] ? parseInt(m[2], 16) : a]);
  }
  ranges.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let prev = 0;
  const parts: string[] = [];
  for (const [a, b] of merged) {
    parts.push((a - prev).toString(36), (b - a).toString(36));
    prev = b;
  }
  return parts.join(' ');
}

/** Inverse of {@link packUnicodeLetters}: `[start0, end0, start1, end1, …]`. */
export function unpackUnicodeLetters(packed: string): Uint16Array {
  const parts = packed.split(' ');
  const out = new Uint16Array(parts.length);
  let prev = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const start = prev + parseInt(parts[i] ?? '', 36);
    prev = start + parseInt(parts[i + 1] ?? '', 36);
    out[i] = start;
    out[i + 1] = prev;
  }
  return out;
}
