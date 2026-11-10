/**
 * Architecture lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`,
 * built from `architecture.langium`, `arch.langium` and `common.langium`), in its order, as
 * dumped from the 2.0.1 runtime (parser-method §1, D213):
 *
 *   architecture-beta, junction, service, column, group, align, row, `--`, in, `:`, `-`,
 *   ARROW_DIRECTION, ARROW_GROUP, ARROW_INTO, ACC_DESCR, ACC_TITLE, TITLE, STRING, ID, NEWLINE,
 *   WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden), ARCH_ICON, ARCH_TITLE.
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that the word keywords
 * have ID as their longer alternative (`services`, `rows` and `architecture-betax` are names,
 * `row` and `in` are keywords) and `--` and `-` have YAML (a `---` block wins over them).
 * ARROW_DIRECTION has none and comes before ID, so a name that starts with a capital `L`, `R`,
 * `T` or `B` splits (`Backend` is `B` then the name `ackend`); so does one that starts with
 * `title` (TITLE has no boundary). The header needs no boundary either: a statement may
 * follow it on its line. ACC_DESCR, ACC_TITLE and TITLE come before WHITESPACE and start
 * `[\t ]*`, so they take the blanks before them (`service titlex` is `service`, ` title`, `x`).
 * A regex backtracks inside a rule; `\w`, `\s` and `\S` are JS's (ASCII `\w`, so `héllo` is an
 * error outside a label); `[^\n\r]` stops at LF and CR only. Where no rule matches it writes
 * one `Error` token over the characters up to the next offset where one does, as Chevrotain
 * skips them.
 *
 * Like radar's lexer it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and marks
 * the tag quotes it turned into `'`; every token maps back to its range in the source, which is
 * never rewritten, and each removed span is a trivia token in source order. v12 turned CRLF and
 * CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's ACC_DESCR is quadratic on
 * lines of unclosed `accDescr {` (each rescans to the end for a `}`), and a quoted label or
 * string that is never closed rescans to the end from every quote; here a string, `}`, YAML or
 * directive scan that failed is not repeated for a start it covered, and a label's run stops
 * at the next bracket.
 */
// cspell:words accdescr acctitle héllo betax ackend titlex
import {
  APOSTROPHE,
  BACKSLASH,
  COLON,
  CR,
  codePointEnd,
  DASH,
  DQUOTE,
  firstHole,
  GT,
  isBlank,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  localOffset,
  LPAREN,
  LT,
  newlineAt,
  PERCENT,
  QUOTE,
  RBRACKET,
  RPAREN,
  SourceOffsets,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { KEYWORDS, T } from './tokens.ts';

/** `kind` of a rule that matched and writes no token (WHITESPACE). */
const SKIP = -1;
/** A memo not set yet. */
const UNSET = -2;

const ARROW_GROUP = '{group}';

/** ARROW_DIRECTION's characters: `L`, `R`, `T`, `B`. */
const isDirection = (c: number) => c === 0x4c || c === 0x52 || c === 0x54 || c === 0x42;
/** Not in `[^\n\r]`. */
const isBreak = (c: number) => c === LF || c === CR;
/** ARCH_ICON's `[\w-:]`. */
const isIconChar = (c: number) => isWord(c) || c === DASH || c === COLON;

/**
 * Lex the architecture body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's architecture ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new ArchitectureLexer(src, from, view).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class ArchitectureLexer {
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
  /** A `"` (`[0]`) or `'` (`[1]`) string starting before this fails (see {@link quoted}). */
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
    // About one token per four characters of architecture text.
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
    let e = this.keywords(p, c);
    if (e < 0 && isDirection(c)) e = this.match(T.Direction, p + 1);
    if (e < 0 && c === LBRACE && this.text.startsWith(ARROW_GROUP, p)) {
      e = this.match(T.ArrowGroup, p + ARROW_GROUP.length);
    }
    if (e < 0 && (c === LT || c === GT)) e = this.match(T.ArrowInto, p + 1);
    if (e < 0) e = this.accessibility(p);
    if (e < 0) e = this.common(p, c);
    if (e < 0 && c === LPAREN) e = this.icon(p);
    if (e < 0 && c === LBRACKET) e = this.label(p);
    return e;
  }

  /** `common`'s rules after TITLE: STRING, ID, NEWLINE, WHITESPACE, DIRECTIVE, comments. */
  private common(p: number, c: number): number {
    let e = -1;
    if (c === DQUOTE || c === APOSTROPHE) {
      const q = this.quoted(p, c);
      if (q >= 0) e = this.match(T.String, q);
    }
    if (e < 0 && isWord(c)) e = this.match(T.Id, this.id(p));
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + this.newline(p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
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
   * The keywords: the word keywords, each of which gives way to an ID that matches longer
   * (Chevrotain's `LONGER_ALT`); `--` and `-`, which give way to a YAML block; `:`.
   */
  private keywords(p: number, c: number): number {
    if (c === DASH) {
      const e = this.yaml(p);
      if (e >= 0) return e;
      return this.text.charCodeAt(p + 1) === DASH
        ? this.match(T.DashDash, p + 2)
        : this.match(T.Dash, p + 1);
    }
    if (c === COLON) return this.match(T.Colon, p + 1);
    for (const [word, kind] of KEYWORDS) {
      if (!this.text.startsWith(word, p)) continue;
      const q = p + word.length;
      const end = this.id(p);
      return end > q ? this.match(T.Id, end) : this.match(kind, q);
    }
    return -1;
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
   * `"([^"\\]|\\.)*"` or the same with `'` from `p`: its end, or -1. STRING, and the quoted
   * forms of ARCH_TITLE after its `[`. A scan fails at the end of the text or at a `\` before a
   * line end. Every quote of its kind it passed was escaped, so the scan from one of them reads
   * the same characters from there on and fails at the same place: a start before a failure of
   * its kind fails at once.
   */
  private quoted(p: number, quote: number): number {
    const k = quote === DQUOTE ? 0 : 1;
    if (p < (this.stringFails[k] ?? -1)) return -1;
    const { text, n } = this;
    let j = p + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === quote) return j + 1;
      if (c === BACKSLASH) {
        if (j + 1 >= n || isLineEnd(text.charCodeAt(j + 1))) break;
        j += 2;
      } else j++;
    }
    this.stringFails[k] = j;
    return -1;
  }

  /** ARCH_ICON: `\([\w-:]+\)`. */
  private icon(p: number): number {
    const { text, n } = this;
    let j = p + 1;
    while (j < n && isIconChar(text.charCodeAt(j))) j++;
    return j > p + 1 && text.charCodeAt(j) === RPAREN ? this.match(T.Icon, j + 1) : -1;
  }

  /**
   * ARCH_TITLE: `\[(?:"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\[\]\r\n]+)\]`. A quoted form needs
   * the `]` right after its closing quote (it may hold brackets and line breaks); else the
   * regex backtracks to the run, which ends at the first bracket or line break, and needs
   * that to be `]`. A run stops at the next `[`, so the runs of two starts never overlap.
   */
  private label(p: number): number {
    const { text, n } = this;
    const q = p + 1;
    const c = text.charCodeAt(q);
    if (c === DQUOTE || c === APOSTROPHE) {
      const e = this.quoted(q, c);
      if (e >= 0 && text.charCodeAt(e) === RBRACKET) return this.match(T.Label, e + 1);
    }
    let j = q;
    while (j < n) {
      const d = text.charCodeAt(j);
      if (d === LBRACKET || d === RBRACKET || isBreak(d)) break;
      j++;
    }
    return j > q && text.charCodeAt(j) === RBRACKET ? this.match(T.Label, j + 1) : -1;
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
    const nl = this.newline(b);
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
    const nl = this.newline(q);
    if (nl > 0) return q + nl;
    return q >= this.n || isSpace(this.text.charCodeAt(q)) ? q : -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The length of the line break at `q` (`\r?\n` or a lone CR, which v12 read as LF), or 0. A
   * CR that ends the source is one break on its own, not a CRLF with the appended line break.
   */
  private newline(q: number): number {
    const nl = newlineAt(this.text, q);
    return nl === 2 && q + 1 === this.len ? 1 : nl;
  }

  /** The end of the run of `[\t ]` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
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
    this.braceAt = this.text.indexOf('}', q);
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
