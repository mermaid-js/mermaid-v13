/**
 * The machinery every lexer ported from a v12 Chevrotain (langium) grammar shares: the
 * first-rule-wins loop with its `Error` runs, the `common.langium` terminals (ACC_DESCR,
 * ACC_TITLE, TITLE, STRING, YAML, DIRECTIVE), the scans they are built from, and the mapping
 * of offsets in the text v12 lexed back to the source with the removed spans as trivia.
 *
 * A diagram's lexer extends {@link RuleLexer} and writes `scan`, its rules in v12's order.
 * Every scan is linear in the text: a string, `accDescr {…}`, YAML or directive scan that
 * failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle
import {
  BACKSLASH,
  codePointEnd,
  COLON,
  CR,
  DASH,
  DQUOTE,
  firstHole,
  type Hole,
  isBlank,
  isDigit,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  localOffset,
  newlineAt,
  PERCENT,
  SourceOffsets,
  type SourceView,
  type TokenStream,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import { dropAt, tagQuotes } from './drop.ts';

/** `kind` of a rule that matched and writes no token (WHITESPACE). */
export const SKIP = -1;
/** A memo not set yet. */
export const UNSET = -2;

/** Not in `[^\n\r]`. */
export const isBreak = (c: number): boolean => c === LF || c === CR;

/**
 * Langium's ID, `[\w]([-\w]*\w)?`, from `p` (a `\w`) in `text[0, n)`: the end of the `[-\w]`
 * run without its trailing dashes.
 */
export function idEnd(text: string, n: number, p: number): number {
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

/** What a diagram tells {@link RuleLexer}: its kinds for the shared terminals, and its sizes. */
export interface RuleLexerOptions {
  readonly accDescr: number;
  readonly accTitle: number;
  readonly title: number;
  /** STRING's kind (a grammar without the shared STRING leaves it out). */
  readonly string?: number;
  /** YAML's kind (a grammar without YAML leaves it out). */
  readonly yaml?: number;
  /** About how many characters of text one token takes (sizes the token arrays). */
  readonly charsPerToken: number;
  /** v12 trimmed leading `\s` before lexing. Default true. */
  readonly trim?: boolean;
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
export abstract class RuleLexer {
  /** The text v12 lexed (tag quotes as `'`), plus the line break v12 appended (unless verbatim). */
  protected readonly text: string;
  /** Length of {@link text} without the appended line break. */
  protected readonly len: number;
  protected readonly n: number;
  protected readonly offsets: SourceOffsets | undefined;
  protected readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  protected hole: number;
  protected readonly w: TokenWriter;
  protected p: number;
  /** The kind of the last match of {@link scan}. */
  protected kind = SKIP;

  // Memos that keep failed or repeated scans linear.
  /** The digit run `[digitsFrom, digitsTo)` last scanned. */
  private digitsFrom = -1;
  private digitsTo = -1;
  /** A `"` (`[0]`) or `'` (`[1]`) string starting before this fails (see {@link string}). */
  private stringFails0 = -1;
  private stringFails1 = -1;
  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;
  /** A YAML block whose body starts at or after this has no closing line. */
  private yamlFails = Infinity;
  /** A directive whose body starts at or after this has no closing `}%%`. */
  private directiveFails = Infinity;

  /**
   * @param verbatim - Lex the view's text as given, as Chevrotain lexes a text handed to it
   *   directly: no line break appended and no leading blanks trimmed.
   */
  constructor(
    protected readonly src: string,
    from: number,
    view: SourceView,
    protected readonly kinds: RuleLexerOptions,
    private readonly verbatim = false
  ) {
    const text = view.mask ? tagQuotes(view) : view.text;
    this.text = verbatim ? text : text + '\n';
    this.len = text.length;
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.p = localOffset(view, from);
    this.w = new TokenWriter((((this.len - this.p) / kinds.charsPerToken) | 0) + 8);
  }

  /** Lex to the end: the tokens, without finishing the writer. */
  protected lexAll(): void {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comment lines) before lexing.
    if (!this.verbatim && this.kinds.trim !== false) {
      while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    }
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
  }

  run(): TokenStream {
    this.lexAll();
    return this.w.finish(this.src);
  }

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected abstract scan(p: number): number;

  protected match(kind: number, end: number): number {
    this.kind = kind;
    return end;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** `word(?:(?=%%)|(?!\S))` after a word that ends at `q`. */
  protected boundary(q: number): boolean {
    const c = this.text.charCodeAt(q);
    return q >= this.n || isSpace(c) || (c === PERCENT && this.text.charCodeAt(q + 1) === PERCENT);
  }

  /**
   * The first of `words` that starts at `p`, unless an ID (`id`'s kind, see {@link idEnd})
   * matches longer there (Chevrotain's `LONGER_ALT`): then the ID. -1 when none starts there.
   */
  protected keywordOrId(
    p: number,
    words: readonly (readonly [word: string, kind: number])[],
    id: number
  ): number {
    for (const [word, kind] of words) {
      if (!this.text.startsWith(word, p)) continue;
      const q = p + word.length;
      const end = idEnd(this.text, this.n, p);
      return end > q ? this.match(id, end) : this.match(kind, q);
    }
    return -1;
  }

  /** `word(?:(?=%%)|(?!\S))`. */
  protected keyword(word: string, p: number, kind: number): number {
    if (!this.text.startsWith(word, p)) return -1;
    const q = p + word.length;
    return this.boundary(q) ? this.match(kind, q) : -1;
  }

  /**
   * ACC_DESCR, ACC_TITLE and TITLE, which all start `[\t ]*` and a keyword. The blank run is
   * scanned once for the three (and WHITESPACE takes it when none follows).
   */
  protected accessibility(p: number): number {
    return this.accessibilityAt(isBlank(this.text.charCodeAt(p)) ? this.blanks(p) : p);
  }

  /** ACC_DESCR, ACC_TITLE and TITLE from their keyword at `q`. */
  protected accessibilityAt(q: number): number {
    const { text } = this;
    if (text.startsWith('accDescr', q)) {
      const e = this.accDescr(q + 8);
      if (e >= 0) return this.match(this.kinds.accDescr, e);
    }
    if (text.startsWith('accTitle', q)) {
      const r = this.blanks(q + 8);
      if (text.charCodeAt(r) === COLON)
        return this.match(this.kinds.accTitle, this.lineTail(r + 1));
    }
    if (text.startsWith('title', q)) {
      const r = q + 5;
      return this.match(this.kinds.title, isBlank(text.charCodeAt(r)) ? this.lineTail(r + 1) : r);
    }
    return -1;
  }

  /** After `accDescr`: `[\t ]*:` and a line tail, or `\s*{[^}]*}`. */
  protected accDescr(r: number): number {
    const { text } = this;
    const colon = this.blanks(r);
    if (text.charCodeAt(colon) === COLON) return this.lineTail(colon + 1);
    const b = this.spaces(r);
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
  protected string(p: number, quote: number): number {
    const dq = quote === DQUOTE;
    if (p < (dq ? this.stringFails0 : this.stringFails1)) return -1;
    const { text, n } = this;
    let j = p + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === quote) return this.match(this.kinds.string ?? SKIP, j + 1);
      if (c === BACKSLASH) {
        if (j + 1 >= n || isLineEnd(text.charCodeAt(j + 1))) break;
        j += 2;
      } else j++;
    }
    if (dq) this.stringFails0 = j;
    else this.stringFails1 = j;
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
    const nl = this.newline(b);
    if (nl === 0) return -1;
    const body = b + nl;
    if (body >= this.yamlFails) return -1;
    const kind = this.kinds.yaml ?? SKIP;
    for (let k = body + 1; k < n; k++) {
      if (!isBreak(text.charCodeAt(k - 1)) || !text.startsWith('---', k)) continue;
      const e = this.closer(k + 3);
      if (e >= 0) return this.match(kind, e);
    }
    const e = text.startsWith('---', body) ? this.closer(body + 3) : -1;
    if (e >= 0) return this.match(kind, e);
    this.yamlFails = body;
    return -1;
  }

  /** DIRECTIVE: `%%{[\S\s]*?}%%(?:\r?\n|(?!\S))` (the `[\t ]*` before it is WHITESPACE's). */
  protected directive(p: number): number {
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

  /** DIRECTIVE at the `%%` at `p`, else SINGLE_LINE_COMMENT to the line's end. */
  protected directiveOrComment(p: number): number {
    const e = this.directive(p);
    return e >= 0 ? e : this.match(Kind.Comment, this.lineEnd(p + 2));
  }

  /** `(?:\r?\n|(?!\S))` at `q`: its end, or -1. */
  protected closer(q: number): number {
    const nl = this.newline(q);
    if (nl > 0) return q + nl;
    return q >= this.n || isSpace(this.text.charCodeAt(q)) ? q : -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The length of the line break at `q` (`\r?\n` or a lone CR, which v12 read as LF), or 0.
   * A lexer whose v12 counted a CR that ends the source as a break of its own overrides this
   * with {@link newlineInSource}.
   */
  protected newline(q: number): number {
    return newlineAt(this.text, q);
  }

  /**
   * {@link newline} where a CR that ends the source is one break on its own, not a CRLF with
   * the appended line break.
   */
  protected newlineInSource(q: number): number {
    const nl = newlineAt(this.text, q);
    return nl === 2 && q + 1 === this.len ? 1 : nl;
  }

  /** The end of the run of `[\t ]` from `q`. */
  protected blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `\s` from `q`. */
  protected spaces(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `[0-9]` from `q`, a run scanned once. */
  protected digits(q: number): number {
    if (q >= this.digitsFrom && q < this.digitsTo) return this.digitsTo;
    let j = q;
    while (j < this.n && isDigit(this.text.charCodeAt(j))) j++;
    this.digitsFrom = q;
    this.digitsTo = j;
    return j;
  }

  /** The end of the run of `[^\n\r]` from `q`. */
  protected lineEnd(q: number): number {
    let j = q;
    while (j < this.n && !isBreak(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `[^\n\r]*?(?=%%)|[^\n\r]*` from `q`: the first `%%` on the line, else the line end. */
  protected lineTail(q: number): number {
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
  protected brace(q: number): number {
    const at = this.braceAt;
    if (at !== UNSET && q >= this.braceFrom && (at === -1 || q <= at)) return at;
    this.braceFrom = q;
    this.braceAt = this.text.indexOf('}', q);
    return this.braceAt;
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  protected source(i: number): number {
    if (i >= this.len) return this.src.length;
    return this.offsets ? this.offsets.source(i) : i;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  protected trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
    }
  }

  /** Write the token `text[s, e)` with its source range. */
  protected emit(kind: number, s: number, e: number): void {
    const a = this.source(s);
    const last = Math.min(e, this.len);
    let b = last > s ? this.source(last - 1) + 1 : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = dropAt(this.holes, this.hole, b);
    }
    this.w.push(kind, a, b);
  }
}
