// cspell:words CLASSDEF CLASSDEFID LLABEL
/**
 * Block lexer: a state machine mirroring the start conditions and rule order of v12's
 * `block.jison` (parser-method §1), built on the kanban lexer's source mapping:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}),
 *   line breaks as v12 had them (CRLF and CR as LF) and each `"` v12 turned into `'` as `'`,
 *   and maps each token back to its range in the source, which is never rewritten. A token
 *   that runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`). Skipped blanks are no token.
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-sensitive; a rule whose pattern ends in a word character gets `\b` (`block`, `space`,
 * `end`, `columns auto`, `default`, …; `block:` and `columns 3` do not); `[\s]+` comes before
 * every rule but the header ones, so it eats line breaks (block's `NL` never fires) and the
 * edge rules' leading `\s*` only matters after a label; the id rule
 * (`[^\(\[\n\-\)\{\}\s\<\>:=]+`) comes before the edge rules, so `x`, `o`, `.`, `~` and quotes
 * are id characters; `\s` takes line separators and `[^\n]` stops at LF only. Inside a shape,
 * a block arrow and its directions, nothing but the listed rules match: no blanks.
 *
 * At the end of the text jison tries the rules once more on the empty input: INITIAL's
 * `<<EOF>>` gives `EOF`, and a `[^"]*`, `[^\n]*` or `[^}]*` state gives one empty token; any
 * other state ends with `$end` alone.
 *
 * jison throws where no rule matches; that is a one-character `Kind.Error` (a code point) and
 * lexing goes on in the same state. Every scan is linear in the text it consumes (R-PARSE-7):
 * the blank, dot and `\w` runs at a position are cached, so a failed edge, direction or
 * class-definition id match, which errors at one character and retries at the next, does not
 * rescan its run. Every other scan either is consumed by the token it ends (ids, strings, digit
 * runs, rest-of-line states, `class` and `style` id lists) or stops after a fixed number of
 * characters (keywords, shape delimiters).
 */
import {
  BACKSLASH,
  BACKTICK,
  COLON,
  COMMA,
  codePointEnd,
  cook,
  CR,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  firstHole,
  GT,
  isDigit,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  localOffset,
  LPAREN,
  LT,
  PIPE,
  QUOTE,
  RBRACE,
  RBRACKET,
  RPAREN,
  SLASH,
  SourceOffsets,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of block.jison (all exclusive) that its rules use.
const S = {
  INITIAL: 0,
  STRING: 1,
  MD_STRING: 2,
  NODE: 3,
  BLOCK_ARROW: 4,
  ARROW_DIR: 5,
  LLABEL: 6,
  CLASSDEF: 7,
  CLASSDEFID: 8,
  CLASS: 9,
  CLASS_STYLE: 10,
  STYLE_STMNT: 11,
  STYLE_DEFINITION: 12,
  ACC_TITLE: 13,
  ACC_DESCR: 14,
  ACC_DESCR_MULTILINE: 15,
} as const;

const LOWER_O = 0x6f;
const LOWER_X = 0x78;
const APOS = "'";

const BLOCK = 'block';
const BLOCK_BETA = 'block-beta';
const SPACE = 'space';
const SPACE_COLON = 'space:';
const ACC_TITLE = 'accTitle';
const ACC_DESCR = 'accDescr';
const END = 'end';

/** The arrow directions, in rule order. */
const DIRECTIONS = ['right', 'left', 'x', 'y', 'up', 'down'] as const;

/**
 * The token each `[^\n]*` (or `[^}]*`) state ends in, and whether it stops at a `}` instead
 * of a line break. These states match the empty string, at the end of the text too.
 */
const REST: Readonly<Record<number, readonly [kind: number, toBrace: boolean]>> = {
  [S.CLASSDEFID]: [T.ClassDefStyleOpts, false],
  [S.CLASS_STYLE]: [T.StyleClass, false],
  [S.STYLE_DEFINITION]: [T.StyleDefinitionData, false],
  [S.ACC_TITLE]: [T.AccTitleValue, false],
  [S.ACC_DESCR]: [T.AccDescrValue, false],
  [S.ACC_DESCR_MULTILINE]: [T.AccDescrMultilineValue, true],
};

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}), and the rewrites of `block.jison`'s actions: `columns 3` reads `3` and
   * `columns auto` `-1`; `space` reads `1` and `space:3` `3`; `:3` reads `3`; a direction
   * drops a leading comma and the blanks after it; the `)` closing a block arrow reads `]>`.
   * Read token text only through this.
   */
  text(j: number): string;
}

/** The text of a token of `kind` whose cooked source text is `text`, as jison's action left it. */
function rewrite(kind: number, text: string): string {
  switch (kind) {
    case T.Columns: {
      const value = text.replace(/^columns\s+/, '');
      return value === 'auto' ? '-1' : value;
    }
    case T.SpaceBlock:
      return text === SPACE ? '1' : text.slice(SPACE_COLON.length);
    case T.Size:
      return text.slice(1);
    case T.Dir:
      return text.replace(/^,\s*/, '');
    case T.BlockArrowEnd:
      return ']>';
    default:
      return text;
  }
}

/**
 * Lex the block body `src[from…]`. `from` and `view` come from `blockView` (`./index.ts`).
 */
export function lex(src: string, from: number, view: SourceView): Lexed {
  const tokens = new BlockLexer(src, from, view).run();
  return {
    tokens,
    text: (j) =>
      rewrite(tokens.kind[j] ?? 0, cook(src, tokens.start[j] ?? 0, tokens.end[j] ?? 0, view)),
  };
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 */
class BlockLexer {
  /** The text v12 lexed (see the file comment), plus the line break v12 appended. */
  private readonly text: string;
  /** Length of v12's text without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  /**
   * `at[i]` is the view-text offset of `text[i]` (`at[len]` its end), when a CR made the two
   * differ; else undefined and they are the same.
   */
  private readonly at: Uint32Array | undefined;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  private covered = 0;
  private readonly w: TokenWriter;
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private p: number;
  /** The last blank run looked up: `[spaceFrom, spaceTo)` is all `\s`, and ends at `spaceTo`. */
  private spaceFrom = -1;
  private spaceTo = -1;
  /** The same for the last run of `.`. */
  private dotFrom = -1;
  private dotTo = -1;
  /** The same for the last run of `\w`. */
  private wordFrom = -1;
  private wordTo = -1;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    const start = localOffset(view, from);
    const { text, at } = this.v12Text(view.text, start);
    this.at = at;
    this.len = text.length;
    this.text = this.placeholders(text, view.mask) + '\n';
    this.n = this.text.length;
    this.p = start;
    // About one token per four characters of block text.
    this.w = new TokenWriter(((this.len - this.p) >> 2) + 8);
  }

  /**
   * `raw` with every CRLF and lone CR as one LF, as v12 had it, and where each character came
   * from. A CR and an LF that a removed span left side by side are two line ends: v12 turned
   * CRs into LFs before it removed anything. Offsets before `start` are kept as they are.
   */
  private v12Text(raw: string, start: number): { text: string; at: Uint32Array | undefined } {
    if (!raw.includes('\r', start)) return { text: raw, at: undefined };
    const at = new Uint32Array(raw.length + 1);
    const out: string[] = [];
    let k = 0;
    let run = 0;
    for (let q = 0; q < raw.length; q++) {
      at[k++] = q;
      if (raw.charCodeAt(q) !== CR) continue;
      out.push(raw.slice(run, q), '\n');
      run = q + 1;
      if (q >= start && raw.charCodeAt(q + 1) === LF && this.adjacent(q)) {
        q++;
        run = q + 1;
      }
    }
    out.push(raw.slice(run));
    at[k] = raw.length;
    return { text: out.join(''), at: at.subarray(0, k + 1) };
  }

  /**
   * `text` with each `"` that v12's `cleanupText` turned into `'` (an attribute quote in a
   * tag) as `'`, in place. v12's entity placeholders change no rule's match (no rule stops at
   * a `#` or a `;` that a `\w` or a blank would not stop at too), so entities stay as written.
   */
  private placeholders(text: string, mask: Uint8Array | undefined): string {
    if (!mask || !text.includes('"')) return text;
    const parts: string[] = [];
    let run = 0;
    for (let q = text.indexOf('"'); q !== -1; q = text.indexOf('"', q + 1)) {
      if (((mask[this.source(q)] ?? 0) & QUOTE) === 0) continue;
      parts.push(text.slice(run, q), APOS);
      run = q + 1;
    }
    parts.push(text.slice(run));
    return parts.join('');
  }

  /** Whether view-text offsets `q` and `q + 1` are next to each other in the source. */
  private adjacent(q: number): boolean {
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1;
  }

  run(): TokenStream {
    while (this.p < this.n) this.step(this.text.charCodeAt(this.p));
    this.atEnd();
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The rules jison tries once more on the empty input at the end of the text. */
  private atEnd(): void {
    const { len, state } = this;
    if (state === S.INITIAL) this.emit(T.Eof, len, len);
    else if (state === S.STRING) this.emit(T.Str, len, len);
    else {
      const rest = REST[state];
      if (rest) this.emit(rest[0], len, len);
    }
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** View-text offset of `text[i]`. */
  private view(i: number): number {
    return this.at ? (this.at[i] ?? 0) : i;
  }

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  private source(i: number): number {
    if (i >= this.len) return this.src.length;
    const v = this.view(i);
    return this.offsets ? this.offsets.source(v) : v;
  }

  /** Source offset just past the last source character of `text[i]` (a CRLF's LF). */
  private sourceEnd(i: number): number {
    const v = this.view(i + 1) - 1;
    return (this.offsets ? this.offsets.source(v) : v) + 1;
  }

  /**
   * Write the removed spans that start before `at` (a source offset) as trivia. A dropped `;`
   * that no token's range took (one after skipped blanks) is a `Space` token of its own.
   */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
      else if (h.start >= this.covered) this.w.push(Kind.Space, h.start, h.end);
    }
  }

  /** Write the token `text[s, end)` with its source range, and move to `end`. */
  private emit(kind: number, s: number, end: number): void {
    const a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.sourceEnd(last - 1) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    if (b > this.covered) this.covered = b;
    this.p = end;
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }

  /** Write the token `text[p, end)` and enter `state` (jison `pushState`). */
  private begin(kind: number, end: number, state: number): void {
    this.emit(kind, this.p, end);
    this.stack.push(this.state);
    this.state = state;
  }

  /** Write the token `text[p, end)` and leave the current state (jison `popState`). */
  private pop(kind: number, end: number): void {
    this.emit(kind, this.p, end);
    this.state = this.stack.pop() ?? S.INITIAL;
  }

  /** Write the token `text[p, end)` and swap the current state for `state` (pop, then push). */
  private swap(kind: number, end: number, state: number): void {
    this.emit(kind, this.p, end);
    this.state = state;
  }

  /** Write a one-code-point `Kind.Error` at `p`: no rule matches there. */
  private error(): void {
    this.emit(Kind.Error, this.p, codePointEnd(this.text, this.p));
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of `\s` from `q` (cached: every offset in a run shares its end). */
  private spaces(q: number): number {
    if (q >= this.spaceFrom && q <= this.spaceTo) return this.spaceTo;
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    this.spaceFrom = q;
    this.spaceTo = j;
    return j;
  }

  /** The end of the run of `.` from `q` (cached as {@link spaces} is). */
  private dots(q: number): number {
    if (q >= this.dotFrom && q <= this.dotTo) return this.dotTo;
    let j = q;
    while (this.text.charCodeAt(j) === DOT) j++;
    this.dotFrom = q;
    this.dotTo = j;
    return j;
  }

  /**
   * The end of the run of `\w` from `q` (cached as {@link spaces} is, so a CLASSDEF id with no
   * blank after it, an error at each of its characters, does not rescan the run).
   */
  private word(q: number): number {
    if (q >= this.wordFrom && q <= this.wordTo) return this.wordTo;
    let j = q;
    while (isWord(this.text.charCodeAt(j))) j++;
    this.wordFrom = q;
    this.wordTo = j;
    return j;
  }

  /**
   * The end of the run of `\d` from `q`. Every digit run it scans is consumed by the token it
   * ends (`columns 3`, `space:3`, `:3`), so it needs no cache.
   */
  private digits(q: number): number {
    let j = q;
    while (isDigit(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The first `c` at or after `q`, or the end. */
  private find(c: string, q: number): number {
    const e = this.text.indexOf(c, q);
    return e === -1 ? this.n : e;
  }

  /** Whether the case-sensitive literal `word` is at `q`. */
  private literal(word: string, q: number): boolean {
    return this.text.startsWith(word, q);
  }

  /** Whether the literal `word` is at `q`, followed by `\b` (`word` ends in a word character). */
  private keyword(word: string, q: number): boolean {
    return this.literal(word, q) && !isWord(this.text.charCodeAt(q + word.length));
  }

  /** The end of `word\s+` at `p`, or -1. */
  private keywordBlanks(word: string): number {
    const { p } = this;
    if (!this.literal(word, p)) return -1;
    const e = this.spaces(p + word.length);
    return e > p + word.length ? e : -1;
  }

  // --- Rules --------------------------------------------------------------------------------

  private step(c: number): void {
    switch (this.state) {
      case S.INITIAL:
        this.initial(c);
        return;
      case S.STRING:
        this.string(c);
        return;
      case S.MD_STRING:
        this.mdString(c);
        return;
      case S.NODE:
        this.node(c);
        return;
      case S.BLOCK_ARROW:
        this.blockArrow(c);
        return;
      case S.ARROW_DIR:
        this.arrowDir(c);
        return;
      case S.LLABEL:
        this.linkLabel(c);
        return;
      case S.CLASSDEF:
        this.classDefId();
        return;
      case S.CLASS:
        this.entityIds(T.ClassEntityIds, S.CLASS_STYLE);
        return;
      case S.STYLE_STMNT:
        this.entityIds(T.StyleEntityIds, S.STYLE_DEFINITION);
        return;
      default:
        this.rest(c);
    }
  }

  private initial(c: number): void {
    if (this.keywords(c)) return;
    const { text, p } = this;
    // `[\s]+`: skipped.
    if (isSpace(c)) {
      this.p = this.spaces(p);
      return;
    }
    if (this.quote(c) || this.statements(c)) return;
    const open = opener(c, text.charCodeAt(p + 1), text.charCodeAt(p + 2));
    if (open > 0) {
      this.begin(T.NodeDStart, p + open, S.NODE);
      return;
    }
    if (c === LT && text.charCodeAt(p + 1) === LBRACKET) {
      this.begin(T.BlockArrowStart, p + 2, S.BLOCK_ARROW);
      return;
    }
    // `[^\(\[\n\-\)\{\}\s\<\>:=]+`.
    let e = p;
    while (e < this.n && !isIdStop(text.charCodeAt(e))) e++;
    if (e > p) {
      this.emit(T.NodeId, p, e);
      return;
    }
    if (this.link(true)) return;
    // `':'\d+`.
    const d = c === COLON ? this.digits(p + 1) : p;
    if (d > p + 1) {
      this.emit(T.Size, p, d);
      return;
    }
    this.error();
  }

  /** The rules before `[\s]+`: `block-beta`, `block:` and `block`. */
  private keywords(c: number): boolean {
    if (c !== 0x62 || !this.literal(BLOCK, this.p)) return false;
    const { p } = this;
    const after = p + BLOCK.length;
    if (this.keyword(BLOCK_BETA, p)) this.emit(T.Block, p, p + BLOCK_BETA.length);
    else if (this.text.charCodeAt(after) === COLON) this.emit(T.IdBlock, p, after + 1);
    else if (!isWord(this.text.charCodeAt(after))) this.emit(T.Block, p, after);
    else return false;
    return true;
  }

  /**
   * The keyword rules between the strings and the shape openers, in jison's order: `columns`,
   * `space`, the unused `default`, `linkStyle` and `interpolate`, `classDef`, `class`,
   * `style`, the accessibility rules and `end`. False when none matches.
   */
  private statements(c: number): boolean {
    const { p } = this;
    switch (c) {
      case 0x63: // c
        return (
          this.columns() ||
          this.statement('classDef', T.ClassDef, S.CLASSDEF) ||
          this.statement('class', T.Class, S.CLASS)
        );
      case 0x73: // s
        return this.space() || this.statement('style', T.Style, S.STYLE_STMNT);
      case 0x64: // d
        return this.keywordToken('default', T.Default);
      case 0x6c: // l
        return this.keywordToken('linkStyle', T.LinkStyle);
      case 0x69: // i
        return this.keywordToken('interpolate', T.Interpolate);
      case 0x61: // a
        return this.accessibility();
      case 0x65: // e
        if (!this.keyword(END, p)) return false;
        this.emit(T.End, p, this.spaces(p + END.length));
        return true;
      default:
        return false;
    }
  }

  /** `columns\s+auto\b`, then `columns\s+[\d]+`. */
  private columns(): boolean {
    const { p } = this;
    const s = this.keywordBlanks('columns');
    if (s < 0) return false;
    if (this.keyword('auto', s)) {
      this.emit(T.Columns, p, s + 'auto'.length);
      return true;
    }
    const e = this.digits(s);
    if (e === s) return false;
    this.emit(T.Columns, p, e);
    return true;
  }

  /** `space[:]\d+`, then `space\b`. */
  private space(): boolean {
    const { p } = this;
    if (!this.literal(SPACE, p)) return false;
    if (this.literal(SPACE_COLON, p)) {
      const from = p + SPACE_COLON.length;
      const e = this.digits(from);
      if (e > from) {
        this.emit(T.SpaceBlock, p, e);
        return true;
      }
    }
    return this.keywordToken(SPACE, T.SpaceBlock);
  }

  /** `word\s+`, entering `state`. */
  private statement(word: string, kind: number, state: number): boolean {
    const e = this.keywordBlanks(word);
    if (e < 0) return false;
    this.begin(kind, e, state);
    return true;
  }

  /** `accTitle\s*":"\s*`, `accDescr\s*":"\s*`, then `accDescr\s*"{"\s*`. */
  private accessibility(): boolean {
    const { text, p } = this;
    const title = this.literal(ACC_TITLE, p);
    if (!title && !this.literal(ACC_DESCR, p)) return false;
    const s = this.spaces(p + (title ? ACC_TITLE : ACC_DESCR).length);
    const c = text.charCodeAt(s);
    if (c === COLON) {
      this.begin(
        title ? T.AccTitle : T.AccDescr,
        this.spaces(s + 1),
        title ? S.ACC_TITLE : S.ACC_DESCR
      );
      return true;
    }
    if (title || c !== LBRACE) return false;
    this.begin(T.AccDescrMultiline, this.spaces(s + 1), S.ACC_DESCR_MULTILINE);
    return true;
  }

  /** `word\b` at `p` as a token of `kind`. False when it is not there. */
  private keywordToken(word: string, kind: number): boolean {
    if (!this.keyword(word, this.p)) return false;
    this.emit(kind, this.p, this.p + word.length);
    return true;
  }

  /**
   * The edge rules at `p`, each with its leading `\s*` and trailing `\s*`: the three `LINK`
   * forms, then (with `labelled`, in INITIAL) the three `START_LINK` forms, which enter
   * LLABEL. In LLABEL a `LINK` leaves it. False when none matches.
   */
  private link(labelled: boolean): boolean {
    const { text } = this;
    const s = this.spaces(this.p);
    const c = text.charCodeAt(s);
    // `[xo<]?`: only `-`, `=` or `.` can follow, so a failed match without it fails too.
    const q = c === LOWER_X || c === LOWER_O || c === LT ? s + 1 : s;
    const end = linkEnd(text, q, this.dots(q + (text.charCodeAt(q) === DASH ? 1 : 0)));
    if (end > 0) {
      const e = this.spaces(end);
      if (labelled) this.emit(T.Link, this.p, e);
      else this.pop(T.Link, e);
      return true;
    }
    if (!labelled) return false;
    const d = text.charCodeAt(q);
    const d2 = text.charCodeAt(q + 1);
    if ((d === DASH && (d2 === DASH || d2 === DOT)) || (d === EQUALS && d2 === EQUALS)) {
      this.begin(T.StartLink, this.spaces(q + 2), S.LLABEL);
      return true;
    }
    return false;
  }

  /** `"` closes; `[^"]*` is the text, line breaks included. */
  private string(c: number): void {
    if (c === DQUOTE) this.pop(T.StringEnd, this.p + 1);
    else this.emit(T.Str, this.p, this.find('"', this.p));
  }

  /** Not a backtick or quote: the text; a backtick then a quote closes; a lone one matches no rule. */
  private mdString(c: number): void {
    const { text, p } = this;
    if (c !== BACKTICK && c !== DQUOTE) {
      let e = p + 1;
      while (e < this.n && text.charCodeAt(e) !== BACKTICK && text.charCodeAt(e) !== DQUOTE) e++;
      this.emit(T.MdStr, p, e);
    } else if (c === BACKTICK && text.charCodeAt(p + 1) === DQUOTE) this.pop(T.MdStringEnd, p + 2);
    else this.error();
  }

  /** The shape closers, then a markdown string or a string. Nothing else (no blanks). */
  private node(c: number): void {
    const { text, p } = this;
    const close = closer(c, text.charCodeAt(p + 1), text.charCodeAt(p + 2));
    if (close > 0) this.pop(T.NodeDEnd, p + close);
    else if (!this.quote(c)) this.error();
  }

  /**
   * A quote then a backtick enters the markdown string (no token); else a quote enters the
   * string as a `kind` token (no jison token, but LLABEL's is `LINK_LABEL`). False at any other
   * `c`.
   */
  private quote(c: number, kind: number = T.StringStart): boolean {
    if (c !== DQUOTE) return false;
    const { p } = this;
    if (this.text.charCodeAt(p + 1) === BACKTICK) this.begin(T.MdStringStart, p + 2, S.MD_STRING);
    else this.begin(kind, p + 1, S.STRING);
    return true;
  }

  /** A markdown string or a string, then `"]>"\s*"("`, entering the directions. */
  private blockArrow(c: number): void {
    if (this.quote(c)) return;
    const { text, p } = this;
    if (c === RBRACKET && text.charCodeAt(p + 1) === GT) {
      const s = this.spaces(p + 2);
      if (text.charCodeAt(s) === LPAREN) {
        this.begin(T.ArrowDirStart, s + 1, S.ARROW_DIR);
        return;
      }
    }
    this.error();
  }

  /** `","?\s*<direction>\s*` for each direction in order, then `")"\s*`, leaving the arrow. */
  private arrowDir(c: number): void {
    const { p } = this;
    const s = this.spaces(c === COMMA ? p + 1 : p);
    for (const dir of DIRECTIONS) {
      if (!this.literal(dir, s)) continue;
      this.emit(T.Dir, p, this.spaces(s + dir.length));
      return;
    }
    if (c !== RPAREN) {
      this.error();
      return;
    }
    // jison pops twice: out of ARROW_DIR, then out of BLOCK_ARROW.
    this.pop(T.BlockArrowEnd, this.spaces(p + 1));
    this.state = this.stack.pop() ?? S.INITIAL;
  }

  /** After `--`, `==` or `-.`: a markdown string, the label's quote, or the closing `LINK`. */
  private linkLabel(c: number): void {
    if (!this.quote(c, T.LinkLabel) && !this.link(false)) this.error();
  }

  /** `DEFAULT\s+`, then `\w+\s+`, each entering the class definition's styles. */
  private classDefId(): void {
    const { p } = this;
    const d = this.keywordBlanks('DEFAULT');
    if (d > 0) {
      this.swap(T.DefaultClassDefId, d, S.CLASSDEFID);
      return;
    }
    const w = this.word(p);
    const e = w > p ? this.spaces(w) : w;
    if (e > w) this.swap(T.ClassDefId, e, S.CLASSDEFID);
    else this.error();
  }

  /** `(\w+)+((","\s*\w+)*)`, entering `next` (the rest of the line). */
  private entityIds(kind: number, next: number): void {
    const { text, p } = this;
    let e = this.word(p);
    if (e === p) {
      this.error();
      return;
    }
    while (text.charCodeAt(e) === COMMA) {
      const s = this.spaces(e + 1);
      const w = this.word(s);
      if (w === s) break;
      e = w;
    }
    this.swap(kind, e, next);
  }

  /**
   * The `[^\n]*` states (a class definition's styles, the rest of a `class` or `style` line,
   * the accessibility values) and `accDescr {`'s `}` then `[^\}]*`. The match may be empty.
   */
  private rest(c: number): void {
    const rest = REST[this.state];
    if (!rest) throw new Error(`block lexer: no rule for start condition ${this.state}`);
    const [kind, toBrace] = rest;
    if (!toBrace) this.pop(kind, this.find('\n', this.p));
    else if (c === RBRACE) this.pop(T.AccDescrMultilineEnd, this.p + 1);
    else this.emit(kind, this.p, this.find('}', this.p));
  }
}

/** The characters `[^\(\[\n\-\)\{\}\s\<\>:=]` (an id) stops at. */
const isIdStop = (c: number) =>
  c === LPAREN ||
  c === LBRACKET ||
  c === DASH ||
  c === RPAREN ||
  c === LBRACE ||
  c === RBRACE ||
  c === LT ||
  c === GT ||
  c === COLON ||
  c === EQUALS ||
  isSpace(c);

/** In `[-xo>]` with `-` replaced by `mark` (the `LINK` rules' last character). */
const isLinkTip = (c: number, mark: number) =>
  c === mark || c === LOWER_X || c === LOWER_O || c === GT;

/**
 * The end of `\-\-+[-xo>]`, `\=\=+[=xo>]` or `\-?\.+\-[xo>]?` at `q` (after `[xo<]?`), or -1.
 * `dotsEnd` is the end of the run of `.` after `q`'s optional `-`.
 */
function linkEnd(text: string, q: number, dotsEnd: number): number {
  const c = text.charCodeAt(q);
  if (c === DASH || c === EQUALS) {
    // `\-\-+` takes the whole run, then gives one back to `[-xo>]` when no tip follows.
    let e = q;
    while (text.charCodeAt(e) === c) e++;
    if (e - q >= 2) {
      if (isLinkTip(text.charCodeAt(e), c)) return e + 1;
      if (e - q >= 3) return e;
    }
    if (c === EQUALS) return -1;
  }
  const dots = c === DASH ? q + 1 : q;
  if (dotsEnd === dots || text.charCodeAt(dotsEnd) !== DASH) return -1;
  // `[xo>]?`.
  return isLinkTip(text.charCodeAt(dotsEnd + 1), GT) ? dotsEnd + 2 : dotsEnd + 1;
}

/**
 * The length of the shape opener at `c d e`, in rule order (`-)`, `(-`, `))`, `)`, `(((`,
 * `((`, `{{`, `{`, `>`, `([`, `(`, `[[`, `[|`, `[(`, `[\`, `[/`, `[`), or 0. `)))` comes
 * after `)`, so it never matches.
 */
function opener(c: number, d: number, e: number): number {
  switch (c) {
    case DASH:
      return d === RPAREN ? 2 : 0;
    case LPAREN:
      if (d === DASH) return 2;
      if (d === LPAREN) return e === LPAREN ? 3 : 2;
      return d === LBRACKET ? 2 : 1;
    case RPAREN:
      return d === RPAREN ? 2 : 1;
    case LBRACE:
      return d === LBRACE ? 2 : 1;
    case GT:
      return 1;
    case LBRACKET:
      return d === LBRACKET || d === PIPE || d === LPAREN || d === BACKSLASH || d === SLASH ? 2 : 1;
    default:
      return 0;
  }
}

/**
 * The length of the shape closer at `c d e`, in rule order (`(((`, `)))`, `))`, `}}`, `}`,
 * `(-`, `-)`, `((`, `]]`, `(`, `])`, `\]`, `/]`, `)]`, `)`, `]>`, `]`), or 0.
 */
function closer(c: number, d: number, e: number): number {
  switch (c) {
    case LPAREN:
      if (d === LPAREN) return e === LPAREN ? 3 : 2;
      return d === DASH ? 2 : 1;
    case RPAREN:
      if (d === RPAREN) return e === RPAREN ? 3 : 2;
      return d === RBRACKET ? 2 : 1;
    case RBRACE:
      return d === RBRACE ? 2 : 1;
    case DASH:
      return d === RPAREN ? 2 : 0;
    case RBRACKET:
      return d === RBRACKET || d === RPAREN || d === GT ? 2 : 1;
    case BACKSLASH:
    case SLASH:
      return d === RBRACKET ? 2 : 0;
    default:
      return 0;
  }
}
