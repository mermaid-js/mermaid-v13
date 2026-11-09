/**
 * TreeView lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `treeView.langium` and its token builder), in its order (parser-method §1, D213):
 *
 *   `treeView-beta` (longer alternative BARE_NAME), ACC_DESCR, ACC_TITLE, TITLE,
 *   CLASS_ANNOTATION, ICON_ANNOTATION, DESC_ANNOTATION, INDENTATION, QUOTED_NAME,
 *   WS (skipped, never reached), ML_COMMENT (hidden), NL (skipped), BARE_NAME.
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that the keyword gives
 * way to a longer bare name (`treeView-beta   ` and `treeView-beta %% c` are bare names).
 * INDENTATION is not tied to line starts: every blank run that no annotation or accessibility
 * rule takes is one, and line breaks are skipped in v12, so `"q x" trailing` is two names and
 * an annotation may sit on the next line. Here line breaks are `Kind.Newline` tokens for the
 * parser's diagnostics. `\s` is JS's; `[^\n\r]` stops at LF and CR only. Where no rule matches
 * it writes one `Error` token over the characters up to the next offset where one does, as
 * Chevrotain skips them.
 *
 * It lexes the text v12 lexed (pitfall 1): the source view ({@link sourceView}) cuts the comment
 * lines, directives and dropped `;` v12 removed and marks the tag quotes it turned into `'`;
 * then v12's box-drawing pass ({@link boxDrawing}) rewrites pasted `tree(1)` output. Every token
 * maps back to its range in the source, which is never rewritten: a rewritten line's indent to
 * its box prefix. v12 turned CRLF and CR into LF; here each is one line break.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5). v12's BARE_NAME looks ahead at
 * every character, rescanning each blank run once per blank (quadratic on long runs); here the
 * lookahead runs once per blank run. One `}` search serves every unclosed `accDescr {` before
 * what it found; a failed quote scan means no quote of its kind is left.
 */
// cspell:words accdescr acctitle
import {
  APOSTROPHE,
  COLON,
  CR,
  codePointEnd,
  cook,
  DASH,
  DQUOTE,
  firstHole,
  HASH,
  isBlank,
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
  RPAREN,
  SEMI,
  SourceOffsets,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { boxDrawing } from './box.ts';
import type { BoxPass, BoxRewrite } from './box.ts';
import { T } from './tokens.ts';

/** A memo not set yet. */
const UNSET = -2;

const HEADER = 'treeView-beta';
const ICON = 'icon(';

/** Not in `[^\n\r]`. */
const isBreak = (c: number) => c === LF || c === CR;
/** `[A-Za-z_]`. */
const isNameStart = (c: number) => isLetter(c) || c === UNDERSCORE;
/** `[\w-]`. */
const isNameChar = (c: number) => isWord(c) || c === DASH;

/** One lex of a treeView body. */
export interface TreeViewLex {
  /** The tokens, with source ranges, ending with `EOF`. */
  tokens: TokenStream;
  /** What v12's box-drawing pass did to the text (nothing, a rewrite, or an error). */
  box: BoxPass;
  /**
   * Token `j`'s text as v12's lexer read it: CRLF and CR as LF, removed spans cut out, tag
   * quotes as `'`, entities decoded to `&name;` as v12's renderer did, and on a rewritten line
   * the rewrite's text (tabs as four spaces, the new indent).
   */
  text(j: number): string;
  /** The text v12's lexer read before token `j`, as {@link text} gives it. */
  before(j: number): string;
}

/**
 * Lex the treeView body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's treeView ran every shared rewrite). When v12's box-drawing pass would have thrown, the
 * text is lexed as it is and {@link TreeViewLex.box} holds the error.
 */
export function lex(src: string, from: number, view: SourceView): TreeViewLex {
  return new TreeViewLexer(src, from, view).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class TreeViewLexer {
  /** The text v12's lexer read, plus the line break v12 appended. */
  private readonly text: string;
  /** Length of {@link text} without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  private readonly box: BoxPass;
  private readonly rewrite: BoxRewrite | undefined;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  /** Each token's start and end in {@link text}, -1 for a removed span. */
  private starts: Int32Array;
  private ends: Int32Array;
  private count = 0;
  private p: number;
  /** The kind of the last match of {@link scan}. */
  private kind: number = Kind.Error;

  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;

  constructor(
    private readonly src: string,
    private readonly from: number,
    private readonly view: SourceView
  ) {
    const viewText = view.mask ? tagQuotes(view) : view.text;
    let p = localOffset(view, from);
    // v12 trimmed leading blanks (after removing comment lines) before its parser ran.
    while (p < viewText.length && isSpace(viewText.charCodeAt(p))) p++;
    this.box = boxDrawing(viewText, p);
    this.rewrite = this.box.rewrite;
    if (this.rewrite) {
      this.text = this.rewrite.text;
      this.len = this.text.length - 1;
      this.p = 0;
    } else {
      this.text = viewText + '\n';
      this.len = viewText.length;
      this.p = p;
    }
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    // About one token per four characters of treeView text.
    const capacity = ((this.len - this.p) >> 2) + 8;
    this.w = new TokenWriter(capacity);
    this.starts = new Int32Array(capacity);
    this.ends = new Int32Array(capacity);
  }

  run(): TreeViewLex {
    const { text, n } = this;
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
      this.emit(this.kind, p, end);
      this.p = end;
    }
    this.trivia(this.src.length + 1);
    const tokens = this.w.finish(this.src);
    this.record(-1, -1);
    const { src, view, rewrite, starts, ends, len } = this;
    const fromRewrite = (s: number, e: number) =>
      decodeEntities((rewrite?.text ?? '').slice(s, Math.min(e, len)));
    return {
      tokens,
      box: this.box,
      text: (j) => {
        const s = starts[j] ?? -1;
        if (rewrite && s >= 0) return fromRewrite(s, ends[j] ?? s);
        return cook(src, tokens.start[j] ?? 0, tokens.end[j] ?? 0, view);
      },
      before: (j) => {
        if (rewrite) return fromRewrite(0, Math.max(0, starts[j] ?? 0));
        return cook(src, this.from, tokens.start[j] ?? 0, view).trimStart();
      },
    };
  }

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  private scan(p: number): number {
    const { text } = this;
    const c = text.charCodeAt(p);
    if (text.startsWith(HEADER, p)) {
      // `treeView-beta(?:(?=%%)|(?!\S))`, giving way to a longer bare name.
      const e = p + HEADER.length;
      const d = text.charCodeAt(e);
      if (e >= this.n || isSpace(d) || (d === PERCENT && text.charCodeAt(e + 1) === PERCENT)) {
        const bare = this.bareName(p);
        return bare > e ? this.match(T.BareName, bare) : this.match(T.TreeViewBeta, e);
      }
    }
    const blank = isBlank(c);
    const q = blank ? this.blanks(p) : p;
    let e = this.accessibility(q);
    if (e < 0 && blank) e = this.annotation(q);
    if (e < 0 && blank) e = this.match(T.Indentation, q);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.quoted(p, c);
    if (e < 0 && c === PERCENT && text.charCodeAt(p + 1) === PERCENT) {
      e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(text, p));
    if (e < 0) {
      const bare = this.bareName(p);
      if (bare > p) e = this.match(T.BareName, bare);
    }
    return e;
  }

  private match(kind: number, end: number): number {
    this.kind = kind;
    return end;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * ACC_DESCR, ACC_TITLE and TITLE at `q`, the end of the blank run they all start with (the
   * run is scanned once for the three, the annotations and INDENTATION).
   */
  private accessibility(q: number): number {
    const { text } = this;
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
   * CLASS_ANNOTATION, ICON_ANNOTATION and DESC_ANNOTATION at `q`, the end of the blank run
   * before it: `:::[ \t]*[A-Za-z_][\w-]*`, `icon\([\w-]*(?::[\w-]+)?\)`, `##[^\n\r]*`.
   */
  private annotation(q: number): number {
    const { text } = this;
    const c = text.charCodeAt(q);
    if (c === COLON && text.startsWith(':::', q)) {
      const r = this.blanks(q + 3);
      if (!isNameStart(text.charCodeAt(r))) return -1;
      return this.match(T.ClassAnnotation, this.nameChars(r + 1));
    }
    if (text.startsWith(ICON, q)) {
      let r = this.nameChars(q + ICON.length);
      if (text.charCodeAt(r) === COLON) {
        const s = this.nameChars(r + 1);
        if (s > r + 1) r = s;
      }
      return text.charCodeAt(r) === RPAREN ? this.match(T.IconAnnotation, r + 1) : -1;
    }
    if (c === HASH && text.charCodeAt(q + 1) === HASH) {
      return this.match(T.DescAnnotation, this.lineEnd(q + 2));
    }
    return -1;
  }

  /** QUOTED_NAME: `"[^"]*"` or `'[^']*'`; a failed scan leaves no quote of its kind after. */
  private quoted(p: number, quote: number): number {
    const close = this.text.indexOf(String.fromCharCode(quote), p + 1);
    return close < 0 ? -1 : this.match(T.QuotedName, close + 1);
  }

  /**
   * BARE_NAME's end from `p`, or `p` when none starts there:
   * `(?!:::|icon\(|##)[^ \t\n\r"'](?:(?![ \t]+:::[ \t]*[A-Za-z_]|[ \t]+icon\(|[ \t]+##)[^\n\r])*`.
   * The lookahead holds at every blank of a run or at none (it reads past the whole run), so it
   * is checked once per run.
   */
  private bareName(p: number): number {
    const { text, n } = this;
    const c = text.charCodeAt(p);
    if (p >= this.len || isBlank(c) || isBreak(c) || c === DQUOTE || c === APOSTROPHE) return p;
    if (this.annotationAt(p)) return p;
    let j = p + 1;
    while (j < n) {
      const d = text.charCodeAt(j);
      if (isBreak(d)) break;
      if (isBlank(d)) {
        const k = this.blanks(j);
        if (this.annotationAt(k, true)) break;
        j = k;
        continue;
      }
      j++;
    }
    return j;
  }

  /**
   * Whether an annotation starts at `k`: `:::`, `icon(` or `##`; after a blank run (`run`)
   * the `:::` needs `[ \t]*[A-Za-z_]` after it.
   */
  private annotationAt(k: number, run = false): boolean {
    const { text } = this;
    const c = text.charCodeAt(k);
    if (c === COLON && text.startsWith(':::', k)) {
      return !run || isNameStart(text.charCodeAt(this.blanks(k + 3)));
    }
    if (c === HASH) return text.charCodeAt(k + 1) === HASH;
    return text.startsWith(ICON, k);
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of `[\w-]` from `q`. */
  private nameChars(q: number): number {
    let j = q;
    while (j < this.n && isNameChar(this.text.charCodeAt(j))) j++;
    return j;
  }

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

  /** The end of the run of `[^\n\r]` from `q` (v12's `[^\n]`, where CR was LF). */
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

  /** Source offset of the first source character `text[i]` stands for. */
  private sourceStart(i: number): number {
    if (i >= this.len) return this.src.length;
    const v = this.rewrite ? (this.rewrite.first[i] ?? 0) : i;
    return this.offsets ? this.offsets.source(v) : v;
  }

  /** Source offset of the last source character `text[i]` stands for. */
  private sourceLast(i: number): number {
    const v = this.rewrite ? (this.rewrite.last[i] ?? 0) : i;
    return this.offsets ? this.offsets.source(v) : v;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.push(Kind.Comment, h.start, h.end, -1, -1);
      else if (h.kind === 'directive') this.push(Kind.Directive, h.start, h.end, -1, -1);
    }
  }

  /** Write the token `text[s, e)` with its source range. */
  private emit(kind: number, s: number, e: number): void {
    const a = this.sourceStart(s);
    const last = Math.min(e, this.len);
    let b = last > s ? this.sourceLast(last - 1) + 1 : a;
    if (b < a) b = a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.push(kind, a, b, s, e);
  }

  private push(kind: number, a: number, b: number, s: number, e: number): void {
    this.w.push(kind, a, b);
    this.record(s, e);
  }

  /** Keep a token's start and end in {@link text} (-1 for a removed span). */
  private record(s: number, e: number): void {
    if (this.count === this.starts.length) {
      const size = this.count * 2 + 8;
      const starts = new Int32Array(size);
      starts.set(this.starts);
      this.starts = starts;
      const ends = new Int32Array(size);
      ends.set(this.ends);
      this.ends = ends;
    }
    this.starts[this.count] = s;
    this.ends[this.count] = e;
    this.count++;
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

/** `#name;` and `#123;` as `&name;` and `&#123;`, as {@link cook} decodes v12's placeholders. */
function decodeEntities(text: string): string {
  if (!text.includes('#')) return text;
  let out = '';
  let from = 0;
  for (let i = text.indexOf('#'); i !== -1; i = text.indexOf('#', i + 1)) {
    if (i < from) continue;
    let j = i + 1;
    while (j < text.length && isWord(text.charCodeAt(j))) j++;
    if (j === i + 1 || text.charCodeAt(j) !== SEMI) continue;
    const name = text.slice(i + 1, j);
    out += text.slice(from, i) + (/^\d+$/.test(name) ? `&#${name};` : `&${name};`);
    from = j + 1;
    i = j;
  }
  return out + text.slice(from);
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
