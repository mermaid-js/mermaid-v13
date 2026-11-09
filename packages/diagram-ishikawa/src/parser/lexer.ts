// cspell:words betax SPACELINE SPACELIST
/**
 * Ishikawa lexer: the rules of v12's `ishikawa.jison` in order (parser-method §1), with the
 * source mapping copied from the kanban lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}),
 *   line breaks as v12 had them (CRLF and CR as LF) and leading blanks trimmed, and maps each
 *   token back to its range in the source, which is never rewritten. A token that runs over a
 *   removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`).
 *
 * jison facts it reproduces: there are no start conditions and the first rule in order wins
 * (no longest match); the lexer is case-insensitive (ASCII letters only) and both keywords end
 * in `\b`, so `ishikawa-betax` is `ishikawa` then the text `-betax`, and a keyword is a token
 * wherever a token starts (at a line start inside the document too); `\s*%%.*` comes first, so
 * it takes the blanks and line breaks before a `%%` that v12's comment removal left; a regex
 * `.` stops at LF, CR, U+2028 and U+2029, `[\n]` and `[^\n]` at LF only; `[\s]+[\n]`
 * backtracks to the last line break of a blank run, so `[\n]+` only ever takes one and
 * `[\s]+` none. Every character matches some rule: jison never throws here. Every scan is
 * linear in the text it consumes (R-PARSE-7).
 */
import {
  CR,
  firstHole,
  isSpace,
  isWord,
  Kind,
  LF,
  localOffset,
  PERCENT,
  SourceOffsets,
  TokenWriter,
  cook,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/** What a regex `.` does not match, once CRs are LFs. */
const DOT_ENDS = ['\n', ' ', ' '] as const;

/** The two keywords, longest first as in `ishikawa.jison`, lower case. */
const KEYWORDS = ['ishikawa-beta', 'ishikawa'] as const;

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}). Read token text only through this.
   */
  text(j: number): string;
}

/** Lex the ishikawa body `src[from…]`. `view` comes from {@link sourceView}. */
export function lex(src: string, from: number, view: SourceView): Lexed {
  const tokens = new IshikawaLexer(src, from, view).run();
  return {
    tokens,
    text: (j) => cook(src, tokens.start[j] ?? 0, tokens.end[j] ?? 0, view),
  };
}

/** One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source. */
class IshikawaLexer {
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
  private p: number;
  /** The next line end a regex `.` stops at, cached for {@link dotEnd} (-2: not looked up). */
  private readonly nextEnd = [-2, -2, -2];
  /** The next LF at or after the last {@link lineEnd} lookup (-2: not looked up). */
  private nextLf = -2;

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
    // About one token per eight characters of ishikawa text.
    this.w = new TokenWriter((((this.len - this.p) / 8) | 0) + 8);
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
    // At the end jison tries the rules once more on the empty input: `<<EOF>>` matches it.
    this.emit(T.Eof, this.len, this.len);
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

  /** The first LF at or after `q` (the appended one at the latest), as {@link dotEnd} keeps it. */
  private lineEnd(q: number): number {
    if (this.nextLf < q) this.nextLf = this.text.indexOf('\n', q);
    return this.nextLf;
  }

  /** The end of the run of `\s` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The length of the keyword at `q` (`ishikawa-beta` or `ishikawa`, then `\b`), or 0. */
  private keyword(q: number): number {
    const { text } = this;
    for (const word of KEYWORDS) {
      const end = q + word.length;
      if (end > this.n || isWord(text.charCodeAt(end))) continue;
      let k = 0;
      while (k < word.length && lower(text.charCodeAt(q + k)) === word.charCodeAt(k)) k++;
      if (k === word.length) return word.length;
    }
    return 0;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** The first rule of `ishikawa.jison` that matches at `p`, written as its token. */
  private step(c: number): void {
    const { text, p } = this;
    // `\s*\%\%.*`.
    const b = isSpace(c) ? this.blanks(p) : p;
    if (text.charCodeAt(b) === PERCENT && text.charCodeAt(b + 1) === PERCENT) {
      this.emit(T.CommentLine, p, this.dotEnd(b + 2));
      return;
    }
    // `"ishikawa-beta"` and `"ishikawa"` (jison adds `\b` after a literal ending in a letter).
    const k = lower(c) === 0x69 ? this.keyword(p) : 0;
    if (k > 0) {
      this.emit(T.Ishikawa, p, p + k);
      return;
    }
    if (b > p) {
      // `[\s]+[\n]`: back from the end of the blank run to its last LF (not the first blank).
      let l = b - 1;
      while (l > p && text.charCodeAt(l) !== LF) l--;
      if (l > p) {
        this.emit(T.SpaceLine, p, l + 1);
        return;
      }
      // `[\n]+`: one LF (a second one right after it would have been a SPACELINE).
      if (c === LF) {
        this.emit(Kind.Newline, p, p + 1);
        return;
      }
      // `[\s]+`: a blank run with no LF.
      this.emit(T.SpaceList, p, b);
      return;
    }
    // `[^\n]+`: what is left is not `\s`, so not an LF.
    this.emit(T.Text, p, this.lineEnd(p));
  }
}
