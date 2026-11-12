/**
 * What the four railroad lexers share (D511): reading the text v12 lexed, the Chevrotain loop,
 * the rules every grammar repeats, and the mapping of tokens back to the source. Each notation's
 * lexer (`ir/`, `ebnf/`, `abnf/`, `peg/`) is a subclass whose {@link RailroadLexer.scan} tries
 * its grammar's token types in the order `@mermaid-js/parser@2.0.1` built them (parser-method
 * §1, D213). The four grammars do not import `common.langium`; each repeats the same TITLE,
 * ACC_TITLE, ACC_DESCR, whitespace, YAML, directive and `%%` comment terminals, which live here.
 *
 * Chevrotain facts it reproduces: the first token type in order wins, except that a longer
 * match of the type's longer alternative replaces it (`choiceX` is a name, not `choice`; EBNF
 * `(*…*)` is a comment, not `(`); a keyword written as a string has no boundary (`titleCase` is
 * TITLE `title`, then a name); `\s`/`\S` are JS's; `[^\n\r]` stops at LF and CR only; whitespace
 * is `[\t \r\n]+`, so any other `\s` (U+2028, NBSP) is an error outside a string or comment.
 * Where no rule matches it writes one `Error` token over the characters up to the next offset
 * where one does, as Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and marks
 * the tag quotes it turned into `'`; every token maps back to its range in the source, which is
 * never rewritten, and each removed span is a trivia token in source order. v12 turned CRLF and
 * CR into LF; every rule here reads CR as a line break too. Each `#name;` entity reads as `ﬂ`,
 * the name and `¶` (same length), as v12's placeholder did, so no rule takes its `#` or `;`
 * (PEG's `#x;` is an error, not a comment).
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): a string, comment, `accDescr {…}`,
 * YAML or directive scan that failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle
import {
  APOSTROPHE,
  BACKSLASH,
  COLON,
  CR,
  codePointEnd,
  DASH,
  DQUOTE,
  firstHole,
  isBlank,
  isLetter,
  isLineEnd,
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
  SLASH,
  SourceOffsets,
  SPACE,
  STAR,
  TAB,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/** `kind` of a rule that matched and writes no token (whitespace). */
export const SKIP = -1;
/** A memo not set yet. */
const UNSET = -2;

/** Not in `[^\n\r]`. */
export const isBreak = (c: number): boolean => c === LF || c === CR;
/** In `[\t \r\n]`, the grammars' whitespace. */
export const isWhite = (c: number): boolean => c === SPACE || c === TAB || c === LF || c === CR;
/** In `[A-Z_a-z]`. */
export const isIdStart = (c: number): boolean => isLetter(c) || c === UNDERSCORE;
/** In `[\w-]`. */
export const isIdPart = (c: number): boolean => isWord(c) || c === DASH;

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
export abstract class RailroadLexer {
  /** The text v12 lexed (tag quotes as `'`, entities as placeholders), plus v12's `\n`. */
  protected readonly text: string;
  /** Length of {@link text} without the appended line break. */
  private readonly len: number;
  protected readonly n: number;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  private p: number;
  /** The kind of the last match of {@link scan}. */
  private kind = SKIP;

  // Memos that keep failed or repeated scans linear.
  /** A `"` (`[0]`) or `'` (`[1]`) string starting before this fails (see {@link string}). */
  private readonly stringFails = [-1, -1];
  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;
  /** A YAML block whose body starts at or after this has no closing line. */
  private yamlFails = Infinity;
  /** A directive whose body starts at or after this has no closing `}%%`. */
  private directiveFails = Infinity;
  /** A `/*` (`[0]`) or `(*` (`[1]`) comment whose body starts at or after this is never closed. */
  private readonly commentFails = [Infinity, Infinity];

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    this.offsets = view.runs && new SourceOffsets(view.runs);
    const text = placeholders(
      view.mask ? tagQuotes(view.text, view.mask, this.offsets) : view.text
    );
    this.text = text + '\n';
    this.len = text.length;
    this.n = this.text.length;
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.p = localOffset(view, from);
    // About one token per four characters of railroad text.
    this.w = new TokenWriter(Math.ceil((this.len - this.p) / 4) + 8);
  }

  run(): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comment lines) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    let error = -1;
    while (this.p < n) {
      const p = this.p;
      const end = this.scan(p, text.charCodeAt(p));
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

  /**
   * The end of the token type that matches at `p` (its kind set with {@link match}), or -1.
   * `c` is the character at `p`.
   */
  protected abstract scan(p: number, c: number): number;

  protected match(kind: number, end: number): number {
    this.kind = kind;
    return end;
  }

  // --- Rules every grammar has --------------------------------------------------------------

  /** The header keyword `word(?:(?=%%)|(?!\S))`, as {@link T.Header}. */
  protected header(word: string, p: number): number {
    if (!this.text.startsWith(word, p)) return -1;
    const q = p + word.length;
    const c = this.text.charCodeAt(q);
    const ok = q >= this.n || isSpace(c) || (c === PERCENT && this.isPercent(q + 1));
    return ok ? this.match(T.Header, q) : -1;
  }

  /**
   * TITLE, ACC_TITLE and ACC_DESCR, which every grammar has before its name terminal and
   * after its keywords, at `p` (no blanks before them here: whitespace is its own token).
   */
  protected accessibility(p: number): number {
    const { text } = this;
    if (text.startsWith('title', p)) {
      const r = p + 5;
      return this.match(T.Title, isBlank(text.charCodeAt(r)) ? this.lineTail(r + 1) : r);
    }
    if (text.startsWith('accTitle', p)) {
      const r = this.blanks(p + 8);
      if (text.charCodeAt(r) === COLON) return this.match(T.AccTitle, this.lineTail(r + 1));
      return -1;
    }
    if (text.startsWith('accDescr', p)) {
      const e = this.accDescr(p + 8);
      if (e >= 0) return this.match(T.AccDescr, e);
    }
    return -1;
  }

  /** After `accDescr`: `[\t ]*:` and a line tail, or `\s*{[^}]*}`. */
  private accDescr(r: number): number {
    const { text } = this;
    const colon = this.blanks(r);
    if (text.charCodeAt(colon) === COLON) return this.lineTail(colon + 1);
    // The blanks are `\s` too: go on from where the colon scan stopped.
    let b = colon;
    while (b < this.n && isSpace(text.charCodeAt(b))) b++;
    if (text.charCodeAt(b) !== LBRACE) return -1;
    const close = this.brace(b + 1);
    return close < 0 ? -1 : close + 1;
  }

  /** `[A-Z_a-z][\w-]*` at `p` (an identifier start): its end. */
  protected idEnd(p: number): number {
    let j = p + 1;
    while (j < this.n && isIdPart(this.text.charCodeAt(j))) j++;
    return j;
  }

  /**
   * STRING in IR, EBNF and PEG: `"([^"\\]|\\.)*"` or the same with `'`. A scan fails at the
   * end of the text or at a `\` before a line end. Every quote of its kind it passed was
   * escaped, so the scan from one of them reads the same characters from there on and fails at
   * the same place: a start before a failure of its kind fails at once.
   */
  protected string(p: number, quote: number): number {
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

  /** Whether `c` starts an IR, EBNF or PEG string. */
  protected static isQuote(c: number): boolean {
    return c === DQUOTE || c === APOSTROPHE;
  }

  /**
   * The hidden rules every grammar ends with, in its order: whitespace `[\t \r\n]+` (skipped),
   * then YAML (when `yaml`: EBNF reaches it through `-` instead), DIRECTIVE and the `%%`
   * SINGLE_LINE_COMMENT. The `[\t ]*` the last two start with is always whitespace's.
   */
  protected hidden(p: number, c: number, yaml: boolean): number {
    if (isWhite(c)) {
      let j = p + 1;
      while (j < this.n && isWhite(this.text.charCodeAt(j))) j++;
      return this.match(SKIP, j);
    }
    if (yaml && c === DASH) {
      const e = this.yaml(p);
      if (e >= 0) return e;
    }
    if (c === PERCENT && this.isPercent(p + 1)) {
      const e = this.directive(p);
      if (e >= 0) return e;
      return this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return -1;
  }

  /**
   * YAML: `---[\t ]*\r?\n(?:[\S\s]*?\r?\n)?---(?:\r?\n|(?!\S))`: a closing `---` that ends at a
   * line break, a blank or the end. The optional group is tried first, so the first closing line
   * after a line break in the body wins; only without one does a `---` at the body's start close
   * it (`---\n---\n…\n---` is one block to the last line).
   */
  protected yaml(p: number): number {
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

  /** DIRECTIVE: `%%{[\S\s]*?}%%(?:\r?\n|(?!\S))` (the `[\t ]*` before it is whitespace's). */
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

  /**
   * `\/\*[\s\S]*?\*\/` (`open` `/`) or `\(\*[\s\S]*?\*\)` (`open` `(`) at `p`, as `kind`: to the
   * first closer after the opener, or -1 when it is never closed.
   */
  protected comment(p: number, open: number, kind: number): number {
    const { text } = this;
    if (text.charCodeAt(p) !== open || text.charCodeAt(p + 1) !== STAR) return -1;
    const k = open === SLASH ? 0 : 1;
    const body = p + 2;
    if (body >= (this.commentFails[k] ?? Infinity)) return -1;
    const close = text.indexOf(open === SLASH ? '*/' : '*)', body);
    if (close >= 0) return this.match(kind, close + 2);
    this.commentFails[k] = body;
    return -1;
  }

  /** `(?:\r?\n|(?!\S))` at `q`: its end, or -1. */
  private closer(q: number): number {
    const nl = newlineAt(this.text, q);
    if (nl > 0) return q + nl;
    return q >= this.n || isSpace(this.text.charCodeAt(q)) ? q : -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  protected isPercent(q: number): boolean {
    return this.text.charCodeAt(q) === PERCENT;
  }

  /** The end of the run of `[\t ]` from `q`. */
  protected blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `[^\n\r]` from `q`. */
  protected lineEnd(q: number): number {
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

/**
 * The view's `text` with the tag-attribute quotes v12 turned into `'` (marked in `mask`, by
 * source offset; `at` maps text offsets to the source) turned so too.
 */
function tagQuotes(text: string, mask: Uint8Array, at: SourceOffsets | undefined): string {
  let out = '';
  let from = 0;
  for (let i = text.indexOf('"'); i !== -1; i = text.indexOf('"', i + 1)) {
    if (((mask[at ? at.source(i) : i] ?? 0) & QUOTE) === 0) continue;
    out += text.slice(from, i) + "'";
    from = i + 1;
  }
  return out + text.slice(from);
}

/**
 * Each `#name;` as `ﬂ`, the name and `¶`, of the same length: what v12's `encodeEntities` wrote
 * in its place (`ﬂ°name¶ß`) begins with a character no rule takes, and lexes inside a string or
 * a comment as any other text would.
 */
function placeholders(text: string): string {
  return text.includes('#') ? text.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`) : text;
}
