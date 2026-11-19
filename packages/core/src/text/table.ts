// cspell:words dejavu hhea kepano
// Table measurer: the Node/worker default and the `deterministic: true` measurer
// (DESIGN §5.1, R-TEXT-6, R-TEXT-7). Sums advance widths from generated font tables.
// Based on Pele's metricsMeasurer (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
import { ASCII_MAX, LATIN1_MAX, SPACE } from '../parser-kit/char-codes.ts';
import { familyNames } from './fonts.ts';
import {
  SMALLER,
  Style,
  type FontKey,
  type Measurer,
  type StyleBits,
  type VerticalMetrics,
} from './measurer.ts';
import { FACES } from './metrics.ts';

interface Face {
  regular: Uint16Array;
  bold: Uint16Array;
  /** Advance for characters outside the table: the mean a–z advance, per weight. */
  regularDefault: number;
  boldDefault: number;
  /** ascent, descent, line height in thousandths of an em */
  vertical: readonly [number, number, number];
}

const FALLBACK = 'arial';
/**
 * Names measured with the Courier New row (D644): Courier, the generic monospace families, and
 * the monospace fonts whose advance is within 1% of Courier New's 600/1000 em, as read from
 * their font files (Menlo and DejaVu Sans Mono 602, the others 600).
 */
const MONO_FACE = 'courier new';
const ALIASES: ReadonlySet<string> = new Set([
  'courier',
  'monospace',
  'ui-monospace',
  'andale mono',
  'dejavu sans mono',
  'liberation mono',
  'menlo',
  'monaco',
  'pt mono',
]);
// Table index of a code point: printable ASCII, then Latin-1 from U+00A0.
const LATIN1_AT = 0x7f - 0x20;

function unpack(packed: string): Uint16Array {
  const out = new Uint16Array(packed.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(packed.slice(i * 2, i * 2 + 2), 36);
  return out;
}

function meanLower(table: Uint16Array): number {
  let sum = 0;
  for (let c = 0x61; c <= 0x7a; c++) sum += table[c - 0x20] ?? 0;
  return Math.round(sum / 26);
}

function toFace([ascent, descent, lineGap, regular, bold]: Row): Face {
  const r = unpack(regular);
  const b = unpack(bold);
  return {
    regular: r,
    bold: b,
    regularDefault: meanLower(r),
    boldDefault: meanLower(b),
    vertical: [ascent, descent, ascent + descent + lineGap],
  };
}

/** A face's row as in `FACES`: ascent, descent, line gap, regular and bold advances. */
export type Row = readonly [number, number, number, string, string];

/** The built-in row for a family name, through the monospace aliases (D644). */
export const builtInRow = (name: string): Row | undefined =>
  FACES[ALIASES.has(name) ? MONO_FACE : name];

function isWide(c: number): boolean {
  return (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    // A high surrogate stands for an astral character (emoji, CJK extensions): one em.
    (c >= 0xd800 && c <= 0xdbff)
  );
}

function isZeroWidth(c: number): boolean {
  return (
    c < 0x20 ||
    (c >= 0x7f && c < 0xa0) ||
    c === 0xad ||
    (c >= 0x300 && c <= 0x36f) ||
    (c >= 0x200b && c <= 0x200f) ||
    (c >= 0xdc00 && c <= 0xdfff) ||
    (c >= 0xfe00 && c <= 0xfe0f) ||
    c === 0xfeff
  );
}

/**
 * The width of `text[from, to)` in face `f`: its {@link tableUnits} at its {@link tableSize}, so
 * label layout can measure a slice of a label without slicing it.
 */
function tableWidth(
  f: Face,
  text: string,
  from: number,
  to: number,
  font: FontKey,
  style: StyleBits
): number {
  return unitsWidth(tableUnits(f, text, from, to, font, style), tableSize(font, style));
}

/** The px size the table measures `style` at: smaller for sub- and superscript. */
function tableSize(font: FontKey, style: StyleBits): number {
  return style & (Style.Sub | Style.Sup) ? font.size / SMALLER : font.size;
}

/**
 * The px width of `units` advance units at `size` px: the one place a table measurer scales, so
 * a width from units added up elsewhere is bit for bit the width of the text they sum.
 */
export function unitsWidth(units: number, size: number): number {
  return (units * size) / 1000;
}

/**
 * The advance units face `f` sums for `text[from, to)`, in thousandths of an em. They are
 * integers, and integers well below 2^53 add up exactly, so the units of a slice are the sum of
 * the units of its parts in any order.
 */
function tableUnits(
  f: Face,
  text: string,
  from: number,
  to: number,
  font: FontKey,
  style: StyleBits
): number {
  const mono = (style & Style.Mono) !== 0;
  const bold = (style & Style.Bold) !== 0 || font.weight >= 600;
  const table = bold ? f.bold : f.regular;
  const other = bold ? f.boldDefault : f.regularDefault;
  let units = 0;
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c >= SPACE && c < ASCII_MAX) units += mono ? 600 : (table[c - SPACE] ?? other);
    else units += advance(c, mono, table, other);
  }
  return units;
}

/** The advance units of `c`, outside printable ASCII, in `table` (`other` where it has none). */
function advance(c: number, mono: boolean, table: Uint16Array, other: number): number {
  if (isZeroWidth(c)) return 0;
  if (isWide(c)) return mono ? 1200 : 1000;
  if (mono) return 600;
  if (c < ASCII_MAX) return table[c - 0x20] ?? other;
  if (c <= LATIN1_MAX) return table[c - 0xa0 + LATIN1_AT] ?? other;
  return other;
}

/** Measures `text[from, to)` as `width` measures that slice, bit for bit, without slicing it. */
export type Slice = (
  text: string,
  from: number,
  to: number,
  font: FontKey,
  style: StyleBits
) => number;

/** Where a table measurer keeps its {@link Slice}, so label layout can find it (D645). */
export const SLICE: unique symbol = Symbol('slice');

/**
 * A table measurer's advance units: `units` sums them for `text[from, to)` and `size` is the px
 * size it measures a style at. Its {@link Slice} is {@link unitsWidth} of the two, so label layout
 * can add up the units of a line's words and scale them once, bit for bit the line's width.
 */
export interface Units {
  readonly units: Slice;
  readonly size: (font: FontKey, style: StyleBits) => number;
}

/** Where a table measurer keeps its {@link Units}. */
export const UNITS: unique symbol = Symbol('units');

/** A measurer that can measure part of a string; every table measurer is one. */
export interface SliceMeasurer extends Measurer {
  readonly [SLICE]: Slice;
  readonly [UNITS]: Units;
}

/**
 * A table measurer (DESIGN §5.1) that measures a family with the row `row` gives for it, else
 * with Arial's, with caches of its own. `id` enters the determinism key (R-ARCH-6).
 */
export function tableMeasurerWith(
  row: (name: string) => Row | undefined,
  id: string
): SliceMeasurer {
  const faces = new Map<string, Face>();
  const stacks = new Map<string, Face>();

  const face = (name: string): Face | undefined => {
    let f = faces.get(name);
    if (f) return f;
    const r = row(name);
    if (r) faces.set(name, (f = toFace(r)));
    return f;
  };

  const faceFor = (stack: string): Face => {
    let f = stacks.get(stack);
    if (f) return f;
    for (const name of familyNames(stack)) if ((f = face(name))) break;
    f ??= face(FALLBACK) as Face;
    if (stacks.size >= 256) stacks.clear();
    stacks.set(stack, f);
    return f;
  };

  const slice: Slice = (text, from, to, font, style) =>
    tableWidth(faceFor(font.family), text, from, to, font, style);

  const measurer: Measurer = {
    id,
    width: (text, font, style) => slice(text, 0, text.length, font, style),
    metrics(font: FontKey): VerticalMetrics {
      const [ascent, descent, lineHeight] = faceFor(font.family).vertical;
      return {
        ascent: (ascent * font.size) / 1000,
        descent: (descent * font.size) / 1000,
        lineHeight: (lineHeight * font.size) / 1000,
      };
    },
  };
  const units: Units = {
    units: (text, from, to, font, style) =>
      tableUnits(faceFor(font.family), text, from, to, font, style),
    size: tableSize,
  };
  // Not enumerable: a spread copy with its own `width` must not be measured by the slice.
  return Object.defineProperties(measurer, {
    [SLICE]: { value: slice },
    [UNITS]: { value: units },
  }) as SliceMeasurer;
}

/** The table measurer with the built-in tables only. */
export const tableMeasurer: SliceMeasurer = tableMeasurerWith(builtInRow, 'table');
