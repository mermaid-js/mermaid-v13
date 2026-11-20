/**
 * Radar lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `radar.langium` and `common.langium`), in its order (parser-method §1, D213):
 *
 *   radar-beta:, radar-beta, showLegend, graticule, curve, ticks, axis, max, min,
 *   `:`, `,`, `[`, `]`, `{`, `}`, GRATICULE, BOOLEAN, ACC_DESCR, ACC_TITLE, TITLE, NUMBER,
 *   STRING, ID, NEWLINE, WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden).
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that the word keywords
 * (all but `radar-beta:`) have ID as their longer alternative, so `maxi` and `axisB` are names;
 * the terminals GRATICULE, BOOLEAN and TITLE have none, so `circles` is `circle` then the name
 * `s` and `titleX` is a title then `X` (D357: v12's split, not Pele's). `radar-beta` needs a
 * blank, `%%` or the end after it (`tokenBuilder.ts`). A regex backtracks inside a rule (`12.`
 * is `1`, then the name `2`, then an error); `\w`, `\s` and `\S` are JS's (ASCII `\w`, so
 * `über` is an error); `[^\n\r]` stops at LF and CR only. Where no rule matches it writes one
 * `Error` token over the characters up to the next offset where one does, as Chevrotain skips
 * them.
 *
 * Like pie's lexer it lexes the text v12 lexed (pitfall 1): the source view ({@link sourceView})
 * cuts the comment lines, directives and dropped `;` v12 removed, and marks the tag quotes it
 * turned into `'`; every token maps back to its range in the source, which is never rewritten,
 * and each removed span is a trivia token in source order. v12 turned CRLF and CR into LF;
 * here a CRLF is one line break and a lone CR is one, as LF would be. Entities need nothing:
 * v12's placeholders lex as the `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's NUMBER is quadratic on a long
 * zero run (FLOAT rescans the run from every zero) and ACC_DESCR on lines of unclosed
 * `accDescr {` (each rescans to the end for a `}`); here a digit run is scanned once, and a
 * string, `}`, YAML or directive scan that failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle über
import {
  APOSTROPHE,
  COLON,
  COMMA,
  DASH,
  DIGIT_0,
  DOT,
  DQUOTE,
  isBlank,
  isDigit,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  newlineAt,
  PERCENT,
  RBRACE,
  RBRACKET,
} from '@mermaid-js/core/parser-kit';
import { idEnd, isBreak, RuleLexer, SKIP } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { PREFIX_KEYWORDS, T } from './tokens.ts';

const HEADER = 'radar-beta';

/** The word keywords after the header, in Chevrotain's order; each yields to a longer ID. */
const WORDS: readonly (readonly [word: string, kind: number])[] = [
  ['showLegend', T.ShowLegend],
  ['graticule', T.Graticule],
  ['curve', T.Curve],
  ['ticks', T.Ticks],
  ['axis', T.Axis],
  ['max', T.Max],
  ['min', T.Min],
];

/** The one-character keywords, by character. */
const PUNCTUATION: ReadonlyMap<number, number> = new Map([
  [COLON, T.Colon],
  [COMMA, T.Comma],
  [LBRACKET, T.LBracket],
  [RBRACKET, T.RBracket],
  [LBRACE, T.LBrace],
  [RBRACE, T.RBrace],
]);

/** The terminals GRATICULE and BOOLEAN: literal alternatives with no boundary. */
const TERMINALS: readonly (readonly [word: string, kind: number])[] = PREFIX_KEYWORDS.filter(
  (k) => k.kind !== T.Title
).flatMap((k) => k.words.map((w) => [w, k.kind] as const));

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 4,
};

/**
 * Lex the radar body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's radar ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new RadarLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class RadarLexer extends RuleLexer {
  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.keywords(p);
    if (e < 0) {
      const punctuation = PUNCTUATION.get(c);
      if (punctuation !== undefined) e = this.match(punctuation, p + 1);
    }
    if (e < 0) e = this.terminal(p);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && isDigit(c)) e = this.number(p);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    if (e < 0 && isWord(c)) e = this.match(T.Id, idEnd(this.text, this.n, p));
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === DASH) e = this.yaml(p);
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * `radar-beta:`; `radar-beta(?:(?=%%)|(?!\S))`; then the word keywords, each of which gives
   * way to an ID that matches longer (Chevrotain's `LONGER_ALT`). The header's ID can never be
   * longer: its boundary ends every name.
   */
  private keywords(p: number): number {
    const { text } = this;
    if (text.startsWith(HEADER, p)) {
      const q = p + HEADER.length;
      const c = text.charCodeAt(q);
      if (c === COLON) return this.match(T.RadarBetaColon, q + 1);
      const ok = q >= this.n || isSpace(c) || (c === PERCENT && text.charCodeAt(q + 1) === PERCENT);
      return ok ? this.match(T.RadarBeta, q) : -1;
    }
    return this.keywordOrId(p, WORDS, T.Id);
  }

  /** GRATICULE (`circle|polygon`) and BOOLEAN (`true|false`): no boundary, no longer name. */
  private terminal(p: number): number {
    for (const [word, kind] of TERMINALS) {
      if (this.text.startsWith(word, p)) return this.match(kind, p + word.length);
    }
    return -1;
  }

  /**
   * NUMBER: `[0-9]+\.[0-9]+(?!\.)` (FLOAT) or `0|[1-9][0-9]*(?!\.)` (INT), with the regex's
   * backtracking: a digit run before a `.` gives up its last digit (`1.23.` is `1.2`, `12.`
   * is `1`); the `(?!\.)` is not on the `0` (`0.` is `0`, then an error; `01` is `0`, `1`).
   */
  private number(p: number): number {
    const { text } = this;
    const d = this.digits(p);
    if (text.charCodeAt(d) === DOT && isDigit(text.charCodeAt(d + 1))) {
      const f = this.digits(d + 1);
      if (text.charCodeAt(f) !== DOT) return this.match(T.Number, f);
      if (f - (d + 1) >= 2) return this.match(T.Number, f - 1);
    }
    if (text.charCodeAt(p) === DIGIT_0) return this.match(T.Number, p + 1);
    if (text.charCodeAt(d) !== DOT) return this.match(T.Number, d);
    return d - p >= 2 ? this.match(T.Number, d - 1) : -1;
  }
}
