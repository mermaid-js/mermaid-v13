/**
 * Mindmap lexer: a state machine mirroring the start conditions and rule order of v12's
 * `mindmap.jison` (parser-method §1), modelled on the timeline lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}) and
 *   line breaks as v12 had them (CRLF and CR as LF), and maps each token back to its range in
 *   the source, which is never rewritten. A token that runs over a removed span is one token
 *   whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only) and `mindmap` ends in `\b`; `\s*%%.*` comes first, so
 * it takes the blanks and line breaks before a `%%` that v12's comment removal left; a regex
 * `.` stops at LF, CR, U+2028 and U+2029, `[\n]` at LF only; `[\s]+[\n]` backtracks to the
 * last line break of a blank run; `<NODE>[^\)\]\(\}]+` and `<ICON>[^\)]+` span line breaks;
 * the rules that return no token (`:::`, `::icon(`, `)` after an icon, the quotes of a
 * string, a line break after a bare `:::`) are kinds of their own with no jison name. jison
 * throws on a `{` or `}` outside a shape, a lone backtick or quote in a markdown string and a
 * U+2028 or U+2029 after `:::`; each is a one-character `Kind.Error` and lexing goes on. Every
 * scan is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words NSTR
import {
  BACKTICK,
  COLON,
  CR,
  DASH,
  DQUOTE,
  firstHole,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  localOffset,
  LPAREN,
  PERCENT,
  RBRACE,
  RBRACKET,
  RPAREN,
  SourceOffsets,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of mindmap.jison.
const S = {
  INITIAL: 0,
  NODE: 1,
  NSTR: 2,
  NSTR2: 3,
  ICON: 4,
  CLASS: 5,
} as const;

/** What a regex `.` does not match, once CRs are LFs. */
const DOT_ENDS = ['\n', '\u2028', '\u2029'] as const;

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/**
 * Lex the mindmap body `src[from…]`. `view` comes from {@link sourceView}. The stream ends in
 * `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it.
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new MindmapLexer(src, from, view).run();
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class MindmapLexer {
  /** The text v12 lexed (line breaks as LF), plus the line break v12 appended. */
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
  /** The next line end a regex `.` stops at, cached for {@link dotEnd} (-2: not looked up). */
  private readonly nextEnd = [-2, -2, -2];

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
    this.text = text + '\n';
    this.n = this.text.length;
    this.p = start;
    // About one token per six characters of mindmap text.
    this.w = new TokenWriter((((this.len - this.p) / 6) | 0) + 8);
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

  /** Whether view-text offsets `q` and `q + 1` are next to each other in the source. */
  private adjacent(q: number): boolean {
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1;
  }

  run(): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    while (this.p < n) this.step(text.charCodeAt(this.p));
    // At the end jison tries the rules once more on the empty input: only INITIAL's `<<EOF>>`
    // matches it; in any other state jison ends with `$end` alone.
    if (this.state === S.INITIAL) this.emit(T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
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

  /** Write the token `text[p, end)` and enter `state` (jison `begin`). */
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

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The first line end a regex `.` stops at (LF, U+2028, U+2029; CRs are LFs by now) at or
   * after `q`, else the end. Found with `indexOf`, keeping the next of each; `q` never
   * decreases between calls, so all calls cost one pass over the text.
   */
  private dotEnd(q: number): number {
    let min = this.n;
    for (let k = 0; k < 3; k++) {
      let e = this.nextEnd[k] ?? -1;
      if (e !== -1 && e < q) this.nextEnd[k] = e = this.text.indexOf(DOT_ENDS[k] ?? '', q);
      if (e !== -1 && e < min) min = e;
    }
    return min;
  }

  /** The end of the run of `\s` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** Whether the case-insensitive literal `word` (lower case) is at `q`. */
  private literal(word: string, q: number): boolean {
    if (q + word.length > this.n) return false;
    for (let k = 0; k < word.length; k++) {
      if (lower(this.text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return true;
  }

  /** The two characters at `q` are `a` then `b`. */
  private pair(q: number, a: number, b: number): boolean {
    return this.text.charCodeAt(q) === a && this.text.charCodeAt(q + 1) === b;
  }

  // --- States -------------------------------------------------------------------------------

  private step(c: number): void {
    switch (this.state) {
      case S.INITIAL:
        this.initial(c);
        return;
      case S.NODE:
        this.node(c);
        return;
      case S.NSTR:
        this.nstr(c);
        return;
      case S.NSTR2:
        this.nstr2(c);
        return;
      case S.ICON:
        this.icon(c);
        return;
      default:
        this.classState(c);
    }
  }

  private initial(c: number): void {
    const { text, p } = this;
    // `\s*\%\%.*`.
    const b = isSpace(c) ? this.blanks(p) : p;
    if (this.pair(b, PERCENT, PERCENT)) {
      this.emit(T.SpaceLine, p, this.dotEnd(b + 2));
      return;
    }
    // `mindmap` (`\b` after it).
    if (lower(c) === 0x6d && this.literal('mindmap', p) && !isWord(text.charCodeAt(p + 7))) {
      this.emit(T.Mindmap, p, p + 7);
      return;
    }
    if (c === COLON) {
      // `:::` and `::icon(`.
      if (this.pair(p + 1, COLON, COLON)) {
        this.begin(T.ClassStart, p + 3, S.CLASS);
        return;
      }
      if (this.literal('::icon(', p)) {
        this.begin(T.IconStart, p + 7, S.ICON);
        return;
      }
    }
    if (isSpace(c)) {
      // `[\s]+[\n]`: back from the end of the blank run to its last LF (not the first blank).
      let l = b - 1;
      while (l > p && text.charCodeAt(l) !== LF) l--;
      if (l > p) {
        this.emit(T.SpaceLine, p, l + 1);
        return;
      }
      // `[\n]+`.
      if (c === LF) {
        let e = p + 1;
        while (text.charCodeAt(e) === LF) e++;
        this.emit(Kind.Newline, p, e);
        return;
      }
    }
    const open = opener(c, text.charCodeAt(p + 1));
    if (open > 0) {
      this.begin(T.NodeDStart, p + open, S.NODE);
      return;
    }
    // `[\s]+` (no LF in the run, or a rule above took it).
    if (isSpace(c)) {
      this.emit(T.SpaceList, p, b);
      return;
    }
    // `[^\(\[\n\)\{\}]+`.
    let e = p;
    while (e < this.n && !isIdStop(text.charCodeAt(e))) e++;
    if (e > p) this.emit(T.NodeId, p, e);
    // A `{` that starts no `{{`, or a `}`: no rule matches, jison throws.
    else this.emit(Kind.Error, p, p + 1);
  }

  private node(c: number): void {
    const { text, p } = this;
    const d = text.charCodeAt(p + 1);
    if (c === DQUOTE) {
      if (d === BACKTICK) this.begin(T.MdStringStart, p + 2, S.NSTR2);
      else this.begin(T.StringStart, p + 1, S.NSTR);
      return;
    }
    const close = closer(c, d);
    if (close > 0) {
      this.pop(T.NodeDEnd, p + close);
      return;
    }
    // `[^\)\]\(\}]+`, line breaks included.
    if (c !== RBRACE) {
      let e = p + 1;
      while (e < this.n && !isDescrStop(text.charCodeAt(e))) e++;
      this.emit(T.NodeDescr, p, e);
      return;
    }
    // `.+(?!\(\()` at a lone `}`: the rest of the line (the lookahead always holds at its end).
    this.emit(T.NodeDescr, p, this.dotEnd(p));
  }

  /** `"` closes; `[^"]+` is the text. */
  private nstr(c: number): void {
    if (c === DQUOTE) {
      this.pop(T.StringEnd, this.p + 1);
      return;
    }
    const e = this.text.indexOf('"', this.p);
    this.emit(T.NodeDescr, this.p, e === -1 ? this.n : e);
  }

  /** Not a backtick or quote: the text; a backtick then a quote closes; a lone one of them matches no rule. */
  private nstr2(c: number): void {
    const { text, p } = this;
    if (c !== BACKTICK && c !== DQUOTE) {
      let e = p + 1;
      while (e < this.n && text.charCodeAt(e) !== BACKTICK && text.charCodeAt(e) !== DQUOTE) e++;
      this.emit(T.NodeDescr, p, e);
      return;
    }
    if (this.pair(p, BACKTICK, DQUOTE)) this.pop(T.MdStringEnd, p + 2);
    else this.emit(Kind.Error, p, p + 1);
  }

  /** `)` closes; `[^\)]+` is the icon, line breaks included. */
  private icon(c: number): void {
    if (c === RPAREN) {
      this.pop(T.IconEnd, this.p + 1);
      return;
    }
    const e = this.text.indexOf(')', this.p);
    this.emit(T.Icon, this.p, e === -1 ? this.n : e);
  }

  /** `.+` is the class, to the line end; a line break right away ends it with no class. */
  private classState(c: number): void {
    if (!isLineEnd(c)) this.pop(T.Class, this.dotEnd(this.p));
    else if (c === LF) this.pop(T.ClassEnd, this.p + 1);
    // U+2028 and U+2029: neither `.` nor `\n` matches them.
    else this.emit(Kind.Error, this.p, this.p + 1);
  }
}

/** The characters `[^\(\[\n\)\{\}]` (a node id) stops at. */
const isIdStop = (c: number) =>
  c === LPAREN || c === LBRACKET || c === LF || c === RPAREN || c === LBRACE || c === RBRACE;

/** The characters `[^\)\]\(\}]` (a shape's text) stops at. */
const isDescrStop = (c: number) => c === RPAREN || c === RBRACKET || c === LPAREN || c === RBRACE;

/** The length of the shape opener at `c d` (`-)`, `(-`, `))`, `)`, `((`, `{{`, `(`, `[`), or 0. */
function opener(c: number, d: number): number {
  switch (c) {
    case DASH:
      return d === RPAREN ? 2 : 0;
    case LPAREN:
      return d === DASH || d === LPAREN ? 2 : 1;
    case RPAREN:
      return d === RPAREN ? 2 : 1;
    case LBRACE:
      return d === LBRACE ? 2 : 0;
    case LBRACKET:
      return 1;
    default:
      return 0;
  }
}

/** The length of the shape closer at `c d` (`))`, `)`, `]`, `}}`, `(-`, `-)`, `((`, `(`), or 0. */
function closer(c: number, d: number): number {
  switch (c) {
    case RPAREN:
      return d === RPAREN ? 2 : 1;
    case RBRACKET:
      return 1;
    case RBRACE:
      return d === RBRACE ? 2 : 0;
    case LPAREN:
      return d === DASH || d === LPAREN ? 2 : 1;
    case DASH:
      return d === RPAREN ? 2 : 0;
    default:
      return 0;
  }
}
