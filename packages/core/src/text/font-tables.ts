// Integrator font tables (D645): checks the entries and builds their table measurer. Loaded only
// when `fontTables` is set, so it costs the static bundle nothing (R-PERF-1).
import { MermaidError } from '../pipeline/errors.ts';
import { familyNames } from './fonts.ts';
import { builtInRow, tableMeasurerWith, type Row, type SliceMeasurer } from './table.ts';

/**
 * A font table an integrator adds (D645): the family, the names also measured with it, hhea
 * ascent, descent and line gap in thousandths of an em, and the regular and bold advances packed
 * as in `FACES`. Without `bold`, bold text uses the regular advances.
 */
export interface FontTable {
  readonly format: 1;
  readonly family: string;
  readonly aliases?: readonly string[];
  readonly ascent: number;
  readonly descent: number;
  readonly lineGap: number;
  readonly regular: string;
  readonly bold?: string;
}

export interface TableMeasurerOptions {
  /** Looked up before the built-in tables, in order; the first table with a name wins. */
  readonly faces?: readonly FontTable[];
}

/** Advances per weight: printable ASCII and Latin-1 from U+00A0, two base-36 digits each. */
const DIGITS = (0x7f - 0x20 + 0x100 - 0xa0) * 2;
const RE_PACKED = /^[0-9a-z]*$/i;

/** One family name as `familyNames` gives it (unquoted, trimmed, lower case), or undefined. */
function familyName(name: unknown): string | undefined {
  const names = typeof name === 'string' ? familyNames(name) : [];
  return names.length === 1 ? names[0] : undefined;
}

function isPacked(value: unknown): value is string {
  return typeof value === 'string' && value.length === DIGITS && RE_PACKED.test(value);
}

type Entry = Partial<Record<keyof FontTable, unknown>>;

const isNumber = (v: unknown): boolean => typeof v === 'number' && v >= 0 && v < Infinity;
const NUMBER = 'a number, 0 or more';
const PACKED = `${DIGITS} base-36 digits`;
// Each field's check and what it must be, in the order they are checked.
const FIELDS: readonly [keyof FontTable, (v: unknown) => unknown, string][] = [
  ['format', (v) => v === 1, '1'],
  ['family', familyName, 'one family name'],
  [
    'aliases',
    (v) => v === undefined || (Array.isArray(v) && v.every(familyName)),
    'a list of family names',
  ],
  ['ascent', isNumber, NUMBER],
  ['descent', isNumber, NUMBER],
  ['lineGap', isNumber, NUMBER],
  ['regular', isPacked, PACKED],
  ['bold', (v) => v === undefined || isPacked(v), PACKED],
];

/** `entry` as a row and its names, or a `SEMANTIC` `MermaidError` naming the entry and what is wrong. */
function checked(entry: FontTable, i: number): [names: string[], row: Row] {
  // An integrator's value: anything at all, whatever its type says.
  const e = ((entry as unknown) ?? {}) as Entry;
  for (const [key, ok, what] of FIELDS) {
    if (ok(e[key])) continue;
    const name = typeof e.family === 'string' ? ` ("${e.family}")` : '';
    throw new MermaidError('SEMANTIC', `Font table ${i}${name}: ${key} must be ${what}.`);
  }
  const { family, aliases = [], ascent, descent, lineGap } = entry;
  const regular = entry.regular.toLowerCase();
  const names = [family, ...aliases].map(familyName) as string[];
  return [names, [ascent, descent, lineGap, regular, entry.bold?.toLowerCase() ?? regular]];
}

/** FNV-1a (32-bit) of `text` in base 36, the same on every host (R-ARCH-6). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/**
 * A table measurer (DESIGN §5.1, D645) that looks a family up in `faces` (by family and
 * aliases), then in the built-in tables and their aliases (D644), then falls back to Arial.
 * Its `id` is `table` without faces and `table:<hash of the faces>` with them (R-ARCH-6).
 * Throws `MermaidError { code: 'SEMANTIC' }` naming the first malformed entry.
 */
export function createTableMeasurer(options: TableMeasurerOptions = {}): SliceMeasurer {
  const { faces: list = [] } = options;
  if (!Array.isArray(list)) throw new MermaidError('SEMANTIC', 'Font tables must be a list.');
  const rows: [string[], Row][] = list.map(checked);
  const given = new Map<string, Row>();
  for (const [names, row] of rows) for (const n of names) if (!given.has(n)) given.set(n, row);
  return tableMeasurerWith(
    (name) => given.get(name) ?? builtInRow(name),
    rows.length ? `table:${hash(JSON.stringify(rows))}` : 'table'
  );
}
