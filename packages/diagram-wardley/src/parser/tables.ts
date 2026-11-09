/**
 * The wardley parser's tables (#489): the kind lists each rule tests (also the probe's
 * expectations, R-LANG-7), the human names of what it expects (R-ERR-2, R-ERR-5) and the
 * probe's mode. Built once at module scope; nothing here changes.
 */
import {
  APOSTROPHE,
  DQUOTE,
  ExpectedTable,
  formatExpected,
  Kind,
  kindSet,
} from '@mermaid-js/core/parser-kit';
import type { TokenStream } from '@mermaid-js/core/parser-kit';
import { STRATEGIES, T, TEXT_STATEMENTS } from './tokens.ts';

export const TEXT = [T.Title, T.AccTitle, T.AccDescr];
export const NAMES = [T.String, T.Id, T.Name];
export const KEYWORD_STARTS = [
  T.Size,
  T.Evolution,
  T.Anchor,
  T.Component,
  T.Evolve,
  T.Pipeline,
  T.Note,
  T.Annotations,
  T.Annotation,
  T.Accelerator,
  T.Deaccelerator,
];
/** What starts a statement after the header (a link starts with a name). */
export const STARTS = [...KEYWORD_STARTS, ...TEXT, ...NAMES];
export const DOC = [...STARTS, Kind.Newline, Kind.EOF];
export const HEAD = [T.WardleyBeta, Kind.Newline];
export const LINE_END = [Kind.Newline, Kind.EOF];
export const STARTS_SET = kindSet(...STARTS);
export const KEYWORD_LINE = kindSet(...KEYWORD_STARTS, ...TEXT);
export const NAME_SET = kindSet(...NAMES);
export const NEWLINE_ONLY = [Kind.Newline];
export const COORDINATE = [T.Decimal, T.Int];
export const AFTER_COORDINATES = [T.Label, T.LParen, T.Inertia, ...LINE_END];
export const AFTER_LABEL = [T.LParen, T.Inertia, ...LINE_END];
export const AFTER_STRATEGY = [T.Inertia, T.LParen, ...LINE_END];
export const AFTER_FROM = [T.LinkPort, T.LinkArrow, T.Arrow, ...NAMES];
export const AFTER_PORT = [T.LinkArrow, T.Arrow, ...NAMES];
export const AFTER_TO = [T.LinkPort, T.LinkLabel, ...LINE_END];
export const AFTER_TO_PORT = [T.LinkLabel, ...LINE_END];
export const AFTER_STAGE = [T.At, T.Slash, T.Arrow, ...LINE_END];
export const AFTER_BOUNDARY = [T.Slash, T.Arrow, ...LINE_END];
export const AFTER_STAGES = [T.Arrow, ...LINE_END];
export const IN_PIPELINE = [Kind.Newline, T.Component, T.RBrace];
/** Inside a component's `(`: a strategy or `inertia`; after a strategy only `inertia`. */
export const IN_PARENS = [T.Strategy, T.Inertia];
export const INERTIA_ONLY = [T.Inertia];
export const AFTER_PIPELINE_CHILD = [T.Label, ...LINE_END];
/** Tokens that cannot start or continue an unquoted name although they look like one (D423). */
export const KEYWORD_PREFIX = kindSet(
  T.Strategy,
  T.WardleyBeta,
  T.Title,
  ...KEYWORD_STARTS,
  T.Label,
  T.Inertia
);
/** `a`, `b` or `c`, each in backticks. */
export const words = (list: readonly string[]): string =>
  formatExpected(list.map((w) => `\`${w}\``));

/**
 * Kinds a probe's cursor follows rather than extends: punctuation, arrows and ports, and a
 * quoted string, which its closing quote ends.
 */
export const PROBE_FOLLOWS = kindSet(
  T.LBracket,
  T.Comma,
  T.RBracket,
  T.At,
  T.Slash,
  T.LParen,
  T.RParen,
  T.Dash,
  T.LBrace,
  T.RBrace,
  T.Arrow,
  T.LinkPort,
  T.LinkArrow,
  T.String
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['`wardley-beta`', [T.WardleyBeta]],
  ['a statement such as `component Tea [0.5, 0.5]` or `A -> B`', KEYWORD_STARTS],
  ['`title`, `accTitle:` or `accDescr`', TEXT],
  ['a name such as `Tea` or `"Hot water"`', NAMES],
  ['a decimal such as `0.5`', [T.Decimal]],
  ['a whole number such as `10`', [T.Int]],
  ['`[`', [T.LBracket]],
  ['`,`', [T.Comma]],
  ['`]`', [T.RBracket]],
  ['`label [x, y]`', [T.Label]],
  ['a strategy such as `(build)`', [T.LParen]],
  [words(STRATEGIES), [T.Strategy]],
  ['`inertia`', [T.Inertia]],
  ['`)`', [T.RParen]],
  ['`-`', [T.Dash]],
  ['a flow such as `+>`', [T.LinkPort]],
  ['an arrow such as `->`', [T.Arrow, T.LinkArrow]],
  ['a link label such as `; label`', [T.LinkLabel]],
  ['`@` and a boundary', [T.At]],
  ['`/` and a second name', [T.Slash]],
  ['`{`', [T.LBrace]],
  ['`}`', [T.RBrace]],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
]);

/** A component inside a pipeline, for the message when the parser finds anything else. */
export const PIPELINE_CHILD = 'a component such as `component Kettle [0.5]`';

/**
 * The probe's mode at `o` (R-LANG-7). The lexer has no modes (Langium's has none), so the
 * mode names what the offset is in: `title`, `accTitle` or `accDescr` past the keyword of
 * that statement, `string` inside a quoted name or text (closed or not), else `INITIAL`.
 */
export function probeMode(src: string, tokens: TokenStream, o: number): string {
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start >= o) break;
    if (end < o) continue;
    const kind = tokens.kind[j] ?? Kind.EOF;
    const c = src.charCodeAt(start);
    if (kind === T.String && o < end) return 'string';
    if (kind === Kind.Error && (c === DQUOTE || c === APOSTROPHE)) return 'string';
    const word = TEXT_STATEMENTS[kind]?.word;
    if (!word) continue;
    const k = start + word.length;
    // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
    const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(k, end));
    if (o > k && (o < end || !block)) return word;
  }
  return 'INITIAL';
}
