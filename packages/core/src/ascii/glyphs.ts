// cspell:words Grooff
// Glyph sets and junction merging for the text grid (DESIGN §6.3, D79, R-ASCII-6).
// The glyph tables and the junction idea are ported from mermaid-ascii
// (https://github.com/AlexanderGrooff/mermaid-ascii, MIT, (c) 2023 Alexander Grooff) at
// commit 5a9df15: pkg/graph/draw.go (`junctionChars`, `mergeJunctions`, `drawBox`) and
// pkg/graph/arrow.go (line, corner, head and tee glyphs). Changed: mermaid-ascii merges
// only light glyphs through a 10×10 table; here every line glyph, heavy, double and dashed
// included, is read as four arms and merged through one lookup.

/** The line glyphs one stroke style draws with: straight runs and the four corners. */
export interface Stroke {
  readonly h: string;
  readonly v: string;
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
}

/** Four glyphs, one per direction. */
export interface Sides {
  readonly up: string;
  readonly down: string;
  readonly left: string;
  readonly right: string;
}

export interface GlyphSet {
  readonly name: 'unicode' | 'ascii';
  readonly solid: Stroke;
  readonly dotted: Stroke;
  readonly thick: Stroke;
  readonly rounded: Stroke;
  readonly double: Stroke;
  /** Where an edge leaves a box: the border glyph with a stem pointing that way. */
  readonly tee: Sides;
  /** Arrowheads, by the direction they point. */
  readonly head: Sides;
  /** `--o` end. */
  readonly circle: string;
  /** `--x` end. */
  readonly cross: string;
}

const stroke = (glyphs: string): Stroke => {
  const [h, v, tl, tr, bl, br] = [...glyphs] as [string, string, string, string, string, string];
  return { h, v, tl, tr, bl, br };
};
const sides = (glyphs: string): Sides => {
  const [up, down, left, right] = [...glyphs] as [string, string, string, string];
  return { up, down, left, right };
};

export const unicode: GlyphSet = {
  name: 'unicode',
  solid: stroke('─│┌┐└┘'),
  dotted: stroke('┄┆┌┐└┘'),
  thick: stroke('━┃┏┓┗┛'),
  rounded: stroke('─│╭╮╰╯'),
  double: stroke('═║╔╗╚╝'),
  tee: sides('┴┬┤├'),
  head: sides('▲▼◄►'),
  circle: '●',
  cross: '✕',
};

export const ascii: GlyphSet = {
  name: 'ascii',
  solid: stroke('-|++++'),
  dotted: stroke('.:++++'),
  thick: stroke('=I++++'),
  rounded: stroke('-|++++'),
  double: stroke('=I++++'),
  tee: sides('++++'),
  head: sides('^v<>'),
  circle: 'o',
  cross: 'x',
};

// A line glyph is four arms (up, right, down, left), each 0 none, 1 light, 2 heavy or
// 3 double, packed two bits each: code = up·64 + right·16 + down·4 + left. BOX[code] is
// the box-drawing glyph with exactly those arms, or a space where Unicode has none.
const BOX =
  ' ╴╸ ╷┐┑╕╻┒┓  ╖ ╗╶─╾ ┌┬┭ ┎┰┱ ╓╥  ╺╼━ ┍┮┯ ┏┲┳        ═╒  ╤    ╔  ╦' +
  '╵┘┙╛│┤┥╡╽┧┪     └┴┵ ├┼┽ ┟╁╅     ┕┶┷ ┝┾┿ ┢╆╈     ╘  ╧╞  ╪        ' +
  '╹┚┛ ╿┦┩ ┃┨┫     ┖┸┹ ┞╀╃ ┠╂╉     ┗┺┻ ┡╄╇ ┣╊╋                     ' +
  ' ╜ ╝        ║╢ ╣╙╨          ╟╫                  ╚  ╩        ╠  ╬';

const H1 = 0x11; // light left and right
const V1 = 0x44; // light up and down
const ARMS = new Map<string, number>();
for (let code = 1; code < 256; code++) {
  const glyph = BOX[code] as string;
  if (glyph !== ' ') ARMS.set(glyph, code);
}
// Rounded corners and dashed runs merge as their solid shapes.
for (const [glyphs, code] of [
  ['╭', 0x14],
  ['╮', 0x05],
  ['╰', 0x50],
  ['╯', 0x41],
  ['┄┈╌', H1],
  ['┅┉╍', H1 * 2],
  ['┆┊╎', V1],
  ['┇┋╏', V1 * 2],
] as const) {
  for (const glyph of glyphs) ARMS.set(glyph, code);
}
// ASCII line glyphs; `+` stands for any corner, tee or crossing.
const ASCII_ARMS = new Map<string, number>([
  ['-', H1],
  ['.', H1],
  ['=', H1 * 2],
  ['|', V1],
  [':', V1],
  ['I', V1 * 2],
  ['+', 0x55],
]);

/** The glyph with the given packed arms (see `BOX`), or undefined when there is none. */
export function glyphFor(arms: number, set: GlyphSet): string | undefined {
  if (set.name === 'unicode') {
    const glyph = BOX[arms];
    return glyph === ' ' ? undefined : glyph;
  }
  const vertical = arms & 0xcc ? 1 : 0;
  const horizontal = arms & 0x33 ? 1 : 0;
  if (vertical && horizontal) return '+';
  // A heavy or double arm sets the high bit of its two.
  const heavy = arms & 0xaa;
  if (horizontal) return heavy ? '=' : '-';
  if (vertical) return heavy ? 'I' : '|';
  return undefined;
}

/**
 * Merges glyph `b`, drawn over glyph `a`, into one glyph. Two line glyphs merge arm by arm,
 * each arm keeping the heavier weight (`─` + `│` → `┼`, `━` + `│` → `┿`, `═` + `│` → `╪`,
 * `-` + `|` → `+`). Anything else, or a mix Unicode has no glyph for, gives `b`: the
 * later writer wins.
 */
export function junction(a: string, b: string): string {
  if (a === b) return a;
  const set = ASCII_ARMS.has(a) || ASCII_ARMS.has(b) ? ascii : unicode;
  const arms = set === ascii ? ASCII_ARMS : ARMS;
  const x = arms.get(a);
  const y = arms.get(b);
  if (x === undefined || y === undefined) return b;
  let merged = 0;
  for (let shift = 0; shift < 8; shift += 2) {
    merged |= Math.max((x >> shift) & 3, (y >> shift) & 3) << shift;
  }
  return glyphFor(merged, set) ?? b;
}
