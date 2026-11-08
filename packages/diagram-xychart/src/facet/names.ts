/**
 * XY chart names (D389): what `isValidId` accepts as a category or plot name, and how a rename
 * writes one. Both are text, bare (a run of letters, digits and `+ = * # _ . & -`, joined
 * without blanks) or quoted (`"Q1 2024"`). The parser decides: a name is valid when, written
 * bare or else in quotes where `kind` goes, it reads back as exactly one occurrence of that name
 * over exactly that text. A bare occurrence renamed to a name bare text cannot hold (a blank,
 * punctuation, a keyword such as `bar`) is written quoted; a quoted one keeps its quotes (D191).
 */
import { parseXyChart } from '../parser/parser.ts';

const HEAD = 'xychart\n  ';

/** A one-plot chart with `written` where a `kind` name goes, and the offset it starts at. */
function sample(kind: string | undefined, written: string): [text: string, at: number] {
  if (kind === 'plot') return [`${HEAD}bar ${written} [1]\n`, HEAD.length + 'bar '.length];
  return [`${HEAD}x-axis [${written}]\n  bar [1]\n`, HEAD.length + 'x-axis ['.length];
}

/** Whether `written` reads back as one `kind` occurrence named `name`, over all of `written`. */
function readsAs(name: string, kind: string | undefined, written: string): boolean {
  const [text, at] = sample(kind, written);
  const { diagnostics, symbols } = parseXyChart(text);
  const want = kind === 'plot' ? 'plot' : 'category';
  const hits = symbols.filter((s) => s.kind === want);
  const hit = hits.length === 1 ? hits[0] : undefined;
  return (
    !diagnostics.some((d) => d.severity === 'error') &&
    hit?.name === name &&
    hit.range.start === at &&
    hit.range.end === at + written.length
  );
}

/** How `name` is written where a bare `kind` occurrence stands: bare if it reads back so. */
export function writtenName(name: string, kind: string): string {
  return readsAs(name, kind, name) ? name : `"${name}"`;
}

/**
 * Why `name` cannot be a `plot` name or, for any other `kind` (the facet's main kind when the
 * service gives none), a category, if it cannot.
 */
export function nameReason(name: string, kind?: string): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A name cannot contain a line break.';
  if (name.includes('"')) return 'A name cannot contain `"`: XY chart strings have no escapes.';
  if (name.trim() !== name) return 'A name cannot start or end with a blank: the chart trims it.';
  if (readsAs(name, kind, name) || readsAs(name, kind, `"${name}"`)) return undefined;
  const noun = kind === 'plot' ? 'a plot name' : 'a category';
  return `\`${name}\` cannot be ${noun}: it does not read back as itself, bare or quoted.`;
}
