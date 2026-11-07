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
  BACKSLASH,
  COLON,
  COMMA,
  CR,
  codePointEnd,
  DASH,
  DIGIT_0,
  DOT,
  DQUOTE,
  firstHole,
  isBlank,
  isDigit,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  localOffset,
  newlineAt,
  PERCENT,
  QUOTE,
  RBRACE,
  RBRACKET,
  SourceOffsets,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { PREFIX_KEYWORDS, T } from './tokens.ts';

/** `kind` of a rule that matched and writes no token (WHITESPACE). */
const SKIP = -1;
/** A memo not set yet. */
const UNSET = -2;

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

/** Not in `[^\n\r]`. */
const isBreak = (c: number) => c === LF || c === CR;

/**
 * Lex the radar body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's radar ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new RadarLexer(src, from, view).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class RadarLexer {
  /** The text v12 lexed (tag quotes as `'`), plus the line break v12 appended. */
  private readonly text: string;
  /** Length of {@link text} without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  private p: number;
  /** The kind of the last match of {@link scan}. */
  private kind = SKIP;

  // Memos that keep failed or repeated scans linear.
  /** The digit run `[digitsFrom, digitsTo)` last scanned. */
  private digitsFrom = -1;
  private digitsTo = -1;
  /** A `"` (`[0]`) or `'` (`[1]`) string starting before this fails (see {@link string}). */
  private readonly stringFails = [-1, -1];
  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;
  /** A YAML block whose body starts at or after this has no closing line. */
  private yamlFails = Infinity;
  /** A directive whose body starts at or after this has no closing `}%%`. */
  private directiveFails = Infinity;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    const text = view.mask ? tagQuotes(view) : view.text;
    this.text = text + '\n';
    this.len = text.length;
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.p = localOffset(view, from);
    // About one token per four characters of radar text.
    this.w = new TokenWriter(((this.len - this.p) >> 2) + 8);
  }

  run(): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comment lines) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    let error = -1;
    while (this.p < n) {
      const p = this.p;
      const end = this.scan(p);
      if (end < 0) {
        // No rule matches: skip to the next offset where one does, as Chevrotain does.
        if (error < 0) error = p;
        this.p = codePointEnd(text, p);
        continue;
      }
      if (error >= 0) {
        this.emit(Kind.Error, error, p);
        error = -1;
      }
      if (this.kind !== SKIP) this.emit(this.kind, p, end);
      this.p = end;
    }
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  private scan(p: number): number {
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
    if (e < 0 && isWord(c)) e = this.match(T.Id, this.id(p));
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === DASH) e = this.yaml(p);
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return e;
  }

  private match(kind: number, end: number): number {
    this.kind = kind;
    return end;
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
    for (const [word, kind] of WORDS) {
      if (!text.startsWith(word, p)) continue;
      const q = p + word.length;
      const end = this.id(p);
      return end > q ? this.match(T.Id, end) : this.match(kind, q);
    }
    return -1;
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

  /** ID: `[\w]([-\w]*\w)?` from `p` (a `\w`): the `[-\w]` run without its trailing dashes. */
  private id(p: number): number {
    const { text, n } = this;
    let j = p + 1;
    let end = j;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (isWord(c)) end = ++j;
      else if (c === DASH) j++;
      else break;
    }
    return end;
  }

  /**
   * ACC_DESCR, ACC_TITLE and TITLE, which all start `[\t ]*` and a keyword. The blank run is
   * scanned once for the three (and WHITESPACE takes it when none follows).
   */
  private accessibility(p: number): number {
    const { text } = this;
    const q = isBlank(text.charCodeAt(p)) ? this.blanks(p) : p;
    if (text.startsWith('accDescr', q)) {
      const e = this.accDescr(q + 8);
      if (e >= 0) return this.match(T.AccDescr, e);
    }
    if (text.startsWith('accTitle', q)) {
      const r = this.blanks(q + 8);
      if (text.charCodeAt(r) === COLON) return this.match(T.AccTitle, this.lineTail(r + 1));
    }
    if (text.startsWith('title', q)) {
      const r = q + 5;
      return this.match(T.Title, isBlank(text.charCodeAt(r)) ? this.lineTail(r + 1) : r);
    }
    return -1;
  }

  /** After `accDescr`: `[\t ]*:` and a line tail, or `\s*{[^}]*}`. */
  private accDescr(r: number): number {
    const { text } = this;
    const colon = this.blanks(r);
    if (text.charCodeAt(colon) === COLON) return this.lineTail(colon + 1);
    let b = r;
    while (b < this.n && isSpace(text.charCodeAt(b))) b++;
    if (text.charCodeAt(b) !== LBRACE) return -1;
    const close = this.brace(b + 1);
    return close < 0 ? -1 : close + 1;
  }

  /**
   * STRING: `"([^"\\]|\\.)*"` or the same with `'`. A scan fails at the end of the text or at
   * a `\` before a line end. Every quote of its kind it passed was escaped, so the scan from
   * one of them reads the same characters from there on and fails at the same place: a
   * start before a failure of its kind fails at once.
   */
  private string(p: number, quote: number): number {
    const k = quote === DQUOTE ? 0 : 1;
    if (p < (this.stringFails[k] ?? -1)) return -1;
    const { text, n } = this;
    let j = p + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === quote) return this.match(T.String, j + 1);
      if (c === BACKSLASH) {
        if (j + 1 >= n || isLineEnd(text.charCodeAt(j + 1))) break;
        j += 2;
      } else j++;
    }
    this.stringFails[k] = j;
    return -1;
  }

  /**
   * YAML: `---[\t ]*\r?\n(?:[\S\s]*?\r?\n)?---(?:\r?\n|(?!\S))`: a closing `---` that ends at a
   * line break, a blank or the end. The optional group is tried first, so the first closing line
   * after a line break in the body wins; only without one does a `---` at the body's start close
   * it (`---\n---\n…\n---` is one block to the last line).
   */
  private yaml(p: number): number {
    const { text, n } = this;
    if (!text.startsWith('---', p)) return -1;
    const b = this.blanks(p + 3);
    const nl = newlineAt(text, b);
    if (nl === 0) return -1;
    const body = b + nl;
    if (body >= this.yamlFails) return -1;
    for (let k = body + 1; k < n; k++) {
      if (!isBreak(text.charCodeAt(k - 1)) || !text.startsWith('---', k)) continue;
      const e = this.closer(k + 3);
      if (e >= 0) return this.match(T.Yaml, e);
    }
    const e = text.startsWith('---', body) ? this.closer(body + 3) : -1;
    if (e >= 0) return this.match(T.Yaml, e);
    this.yamlFails = body;
    return -1;
  }

  /** DIRECTIVE: `%%{[\S\s]*?}%%(?:\r?\n|(?!\S))` (the `[\t ]*` before it is WHITESPACE's). */
  private directive(p: number): number {
    const { text } = this;
    if (text.charCodeAt(p + 2) !== LBRACE) return -1;
    const body = p + 3;
    if (body >= this.directiveFails) return -1;
    for (let k = text.indexOf('}%%', body); k !== -1; k = text.indexOf('}%%', k + 1)) {
      const e = this.closer(k + 3);
      if (e >= 0) return this.match(Kind.Directive, e);
    }
    this.directiveFails = body;
    return -1;
  }

  /** `(?:\r?\n|(?!\S))` at `q`: its end, or -1. */
  private closer(q: number): number {
    const nl = newlineAt(this.text, q);
    if (nl > 0) return q + nl;
    return q >= this.n || isSpace(this.text.charCodeAt(q)) ? q : -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of `[\t ]` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `[0-9]` from `q`, a run scanned once. */
  private digits(q: number): number {
    if (q >= this.digitsFrom && q < this.digitsTo) return this.digitsTo;
    let j = q;
    while (j < this.n && isDigit(this.text.charCodeAt(j))) j++;
    this.digitsFrom = q;
    this.digitsTo = j;
    return j;
  }

  /** The end of the run of `[^\n\r]` from `q`. */
  private lineEnd(q: number): number {
    let j = q;
    while (j < this.n && !isBreak(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `[^\n\r]*?(?=%%)|[^\n\r]*` from `q`: the first `%%` on the line, else the line end. */
  private lineTail(q: number): number {
    const { text, n } = this;
    let j = q;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (isBreak(c) || (c === PERCENT && text.charCodeAt(j + 1) === PERCENT)) break;
      j++;
    }
    return j;
  }

  /** The first `}` at or after `q`, or -1; one search serves every start before what it found. */
  private brace(q: number): number {
    const at = this.braceAt;
    if (at !== UNSET && q >= this.braceFrom && (at === -1 || q <= at)) return at;
    this.braceFrom = q;
    this.braceAt = this.text.indexOf(String.fromCharCode(RBRACE), q);
    return this.braceAt;
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  private source(i: number): number {
    if (i >= this.len) return this.src.length;
    return this.offsets ? this.offsets.source(i) : i;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
    }
  }

  /** Write the token `text[s, e)` with its source range. */
  private emit(kind: number, s: number, e: number): void {
    const a = this.source(s);
    const last = Math.min(e, this.len);
    let b = last > s ? this.source(last - 1) + 1 : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }
}

/** The view's text with the tag-attribute quotes v12 turned into `'` turned so too. */
function tagQuotes(view: SourceView): string {
  const { text, mask, runs } = view;
  if (!mask) return text;
  const at = runs ? new SourceOffsets(runs) : undefined;
  let out = '';
  let from = 0;
  for (let i = text.indexOf('"'); i !== -1; i = text.indexOf('"', i + 1)) {
    if (((mask[at ? at.source(i) : i] ?? 0) & QUOTE) === 0) continue;
    out += text.slice(from, i) + "'";
    from = i + 1;
  }
  return out + text.slice(from);
}
