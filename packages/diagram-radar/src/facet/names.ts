/**
 * Radar names (D357, D358): what `isValidId` accepts as an axis or curve name. The lexer
 * decides: a name is valid when the lexer, reading it where `axis` expects a name, gives one
 * `ID` token over all of it. So a word keyword (`max`), a number, and a name starting with
 * `circle`, `polygon`, `true`, `false` or `title` (which v12's lexer reads before a name, so
 * `circles` is `circle` and `s`) are refused, and so are `accTitle` and `accDescr`, which start
 * a statement when a `:` follows them, as in a detailed entry `accTitle: 1`.
 */
import { formatExpected, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import { lex } from '../parser/lexer.ts';
import { PREFIX_KEYWORDS, T } from '../parser/tokens.ts';

const BEFORE = 'radar-beta\naxis ';
/** Names the lexer reads as an `ID` alone but as a statement before `:`. */
const STATEMENT_NAMES = new Set(['accTitle', 'accDescr']);
/** Kinds whose token is a keyword (all but the punctuation, values and trivia). */
const KEYWORDS = new Set<number>([
  T.RadarBetaColon,
  T.RadarBeta,
  T.ShowLegend,
  T.Graticule,
  T.Curve,
  T.Ticks,
  T.Axis,
  T.Max,
  T.Min,
  T.GraticuleValue,
  T.Boolean,
  T.AccDescr,
  T.AccTitle,
  T.Title,
]);
const PREFIXES = new Set<number>(PREFIX_KEYWORDS.map((k) => k.kind));
/** `circle`, `polygon`, `true`, `false` or `title`. */
const PREFIX_WORDS = formatExpected(PREFIX_KEYWORDS.flatMap((k) => k.words).map((w) => `\`${w}\``));
const LETTERS = 'a name is ASCII letters, digits, `_` and `-`, and does not end with `-`';

/** Why `name` cannot be a radar name of `kind` (`axis` or `curve`), if it cannot. */
export function nameReason(name: string, kind = 'axis'): string | undefined {
  if (name === '') return 'A name cannot be empty.';
  const noun = kind === 'axis' ? 'an axis name' : `a ${kind} name`;
  const src = `${BEFORE}${name}\n`;
  const tokens = lex(src, 0, sourceView(src, 0, []));
  const from = BEFORE.length;
  const to = from + name.length;
  // The first token that reaches into the name (TITLE takes the blank before it).
  let j = 0;
  while (j < tokens.length && ((tokens.end[j] ?? 0) <= from || tokens.kind[j] === Kind.Space)) j++;
  const k = tokens.kind[j] ?? Kind.EOF;
  const end = tokens.end[j] ?? 0;
  const whole = (tokens.start[j] ?? 0) <= from && end === to;
  if (k === T.Id && whole) {
    return STATEMENT_NAMES.has(name)
      ? `\`${name}\` is a keyword, so it cannot be ${noun}.`
      : undefined;
  }
  if (KEYWORDS.has(k) && whole) return `\`${name}\` is a keyword, so it cannot be ${noun}.`;
  if (PREFIXES.has(k) && end < to) {
    const word = name.slice(0, end - from);
    return `\`${name}\` starts with the keyword \`${word}\`, and a name cannot start with ${PREFIX_WORDS}.`;
  }
  if (k === T.Number) {
    return whole
      ? `\`${name}\` is a number, so it cannot be ${noun}.`
      : `\`${name}\` starts with a digit, and a name cannot.`;
  }
  return `\`${name}\` is not a name: ${LETTERS}.`;
}
