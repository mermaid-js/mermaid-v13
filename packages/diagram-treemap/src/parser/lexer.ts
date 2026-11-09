/**
 * Treemap lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `treemap.langium`, which does not import `common.langium`), in its order (parser-method
 * §1, D213):
 *
 *   ACC_DESCR, ACC_TITLE, TITLE, TREEMAP_KEYWORD, CLASS_DEF, `:::`, `:`, `,`, INDENTATION,
 *   WS (skipped, never reached), ML_COMMENT (hidden), NL (skipped), ID2, NUMBER2, STRING2.
 *
 * Chevrotain facts it reproduces: the first rule in order wins, and no rule has a longer
 * alternative, so `treemapx` is the keyword then the name `x` and `titleX` is a title then
 * `X`. INDENTATION comes before WS with the same class, so every blank run is an INDENTATION
 * token, wherever it is, unless one of the three accessibility rules (which start `[\t ]*`)
 * takes it. Line breaks are skipped in v12, so the parser sees rows on one line as rows; here
 * they are `Kind.Newline` tokens for the parser's diagnostics (D401). `\s` is JS's (line
 * breaks and U+2028/U+2029 too: a `classDef` with no styles takes the next line, and
 * `accDescr` reaches a `{` on a later line); `[^\n\r]` stops at LF and CR only. Where no rule
 * matches it writes one `Error` token over the characters up to the next offset where one
 * does, as Chevrotain skips them.
 *
 * Like pie's and radar's lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12
 * turned CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would
 * be, and a `%%` comment ends at either. Entities need nothing: v12's placeholders lex as the
 * `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5). v12's ACC_DESCR is quadratic on
 * repeated unclosed `accDescr {` (each rescans to the end for a `}`); here one `}` search
 * serves every start before what it found. A failed STRING2 scan means no quote of its kind is
 * left, so no later scan of that kind can rescan the same text; NUMBER2 has no backtracking.
 */
// cspell:words accdescr acctitle treemapx
import {
  APOSTROPHE,
  COLON,
  COMMA,
  CR,
  codePointEnd,
  DOT,
  DQUOTE,
  firstHole,
  isBlank,
  isDigit,
  isLetter,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  localOffset,
  newlineAt,
  PERCENT,
  QUOTE,
  RBRACE,
  SEMI,
  SourceOffsets,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/** `kind` of a rule that matched and writes no token. */
const SKIP = -1;
/** A memo not set yet. */
const UNSET = -2;

const HEADER = 'treemap';
const HEADER_BETA = 'treemap-beta';
const CLASS_DEF = 'classDef';

/** Not in `[^\n\r]`. */
const isBreak = (c: number) => c === LF || c === CR;
/** `[a-zA-Z_]`. */
const isIdStart = (c: number) => isLetter(c) || c === UNDERSCORE;
/** `[0-9_.,]`. */
const isNumberChar = (c: number) => isDigit(c) || c === UNDERSCORE || c === DOT || c === COMMA;

/**
 * Lex the treemap body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's treemap ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new TreemapLexer(src, from, view).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class TreemapLexer {
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

  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;

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
    // About one token per four characters of treemap text.
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
    const { text } = this;
    const c = text.charCodeAt(p);
    let e = this.accessibility(p);
    if (e < 0 && text.startsWith(HEADER, p)) {
      const beta = text.startsWith(HEADER_BETA, p);
      e = this.match(T.TreemapKeyword, p + (beta ? HEADER_BETA : HEADER).length);
    }
    if (e < 0 && text.startsWith(CLASS_DEF, p)) e = this.classDef(p + CLASS_DEF.length);
    if (e < 0) e = this.punctuation(p, c);
    if (e < 0 && isBlank(c)) e = this.match(T.Indentation, this.blanks(p));
    if (e < 0 && c === PERCENT && text.charCodeAt(p + 1) === PERCENT) {
      e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(text, p));
    if (e < 0 && isIdStart(c)) e = this.match(T.Id, this.id(p));
    if (e < 0 && isNumberChar(c)) e = this.match(T.Number, this.number(p));
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    return e;
  }

  private match(kind: number, end: number): number {
    this.kind = kind;
    return end;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** `:::`, `:` and `,`, in that order. */
  private punctuation(p: number, c: number): number {
    if (c === COMMA) return this.match(T.Comma, p + 1);
    if (c !== COLON) return -1;
    const { text } = this;
    const triple = text.charCodeAt(p + 1) === COLON && text.charCodeAt(p + 2) === COLON;
    return triple ? this.match(T.StyleSeparator, p + 3) : this.match(T.Separator, p + 1);
  }

  /**
   * ACC_DESCR, ACC_TITLE and TITLE, which all start `[\t ]*` and a keyword. The blank run is
   * scanned once for the three (and INDENTATION takes it when none follows).
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
    const b = this.spaces(r);
    if (text.charCodeAt(b) !== LBRACE) return -1;
    const close = this.brace(b + 1);
    return close < 0 ? -1 : close + 1;
  }

  /**
   * After `classDef`: `\s+([a-zA-Z_][a-zA-Z0-9_]+)(?:\s+([^;\r\n]*))?(?:;)?`. Greedy and with
   * nothing to backtrack into: the name takes its whole run, and once `\s+` matched after it
   * `[^;\r\n]*` matches (perhaps empty) from where the run ends, on a later line if the run
   * crossed a line break.
   */
  private classDef(r: number): number {
    const { text } = this;
    const name = this.spaces(r);
    if (name === r || !isIdStart(text.charCodeAt(name)) || !isWord(text.charCodeAt(name + 1))) {
      return -1;
    }
    let e = name + 2;
    while (isWord(text.charCodeAt(e))) e++;
    const styles = this.spaces(e);
    if (styles > e) {
      e = styles;
      while (e < this.n) {
        const c = text.charCodeAt(e);
        if (c === SEMI || isBreak(c)) break;
        e++;
      }
    }
    if (text.charCodeAt(e) === SEMI) e++;
    return this.match(T.ClassDef, e);
  }

  /** ID2: `[a-zA-Z_][a-zA-Z0-9_]*` from `p` (an ID start). */
  private id(p: number): number {
    let j = p + 1;
    while (isWord(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** NUMBER2: `[0-9_.,]+` from `p`. */
  private number(p: number): number {
    let j = p + 1;
    while (isNumberChar(this.text.charCodeAt(j))) j++;
    return j;
  }

  /**
   * STRING2: `"[^"]*"` or `'[^']*'`. A scan that fails found no quote of its kind to the end,
   * so every later start of that kind fails too, after a scan of its own remaining text.
   */
  private string(p: number, quote: number): number {
    const close = this.text.indexOf(String.fromCharCode(quote), p + 1);
    return close < 0 ? -1 : this.match(T.String, close + 1);
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of `[\t ]` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `\s` from `q`. */
  private spaces(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /**
   * The end of the run of `[^\n]` from `q` in v12's text, where CR was LF: it stops at LF or
   * CR, as {@link isBreak}.
   */
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
