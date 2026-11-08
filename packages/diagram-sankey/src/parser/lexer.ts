/**
 * Sankey lexer: a state machine mirroring the start conditions and rule order of v12's
 * `sankey.jison` (parser-method §1).
 *
 * It lexes the text v12's lexer received (pitfall 1), built from the source without
 * rewriting it, and maps each token back to its source range:
 * - core's source view cuts out comments and directives, marks the `"` that `cleanupText`
 *   turned into `'` (inside `<tag a="x">`) and drops the `;` that `encodeEntities` took off a
 *   `style…:…#…;` line; CRLF and lone CR are LF;
 * - `encodeEntities` turned each `#name;` / `#123;` into a placeholder that starts with a
 *   non-ASCII character: here one character outside printable ASCII stands for the entity;
 * - `prepareTextForParsing` (sankey's own wrapper around the parser) trimmed blanks and line
 *   breaks off both ends of the whole text and collapsed each run of line breaks into one; a
 *   collapsed run is one `Kind.Newline` (or part of an `EscapedText`) whose range covers it.
 *
 * Comments and directives are trivia tokens, each with its own range, in source order; so is a
 * dropped `;` that no token took (`Space`).
 *
 * jison facts it reproduces: the first rule in order wins, even an empty match; the lexer is
 * case-insensitive (ASCII letters only) and both keywords end in `\b`; `sankey-beta` is tried
 * before `sankey`, and neither outside INITIAL; at the end of the text jison tries the rules
 * once more on the empty input: `<<EOF>>` outside quotes, an empty `ESCAPED_TEXT` inside them.
 *
 * jison never threw: on a character outside printable ASCII (other than a line break)
 * `{TEXTDATA}*` and `ESCAPED_TEXT` matched the empty string without consuming it, forever.
 * v13 writes one `Kind.Error` over each run of such characters and goes on in the same state.
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
import {
  COMMA,
  CR,
  DQUOTE,
  firstHole,
  HASH,
  isSpace,
  isWord,
  Kind,
  LF,
  localOffset,
  QUOTE,
  SEMI,
  SourceOffsets,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of sankey.jison.
const S = { INITIAL: 0, CSV: 1, ESCAPED_TEXT: 2 } as const;

/** Stands for an entity placeholder in v12's text: a character no rule consumes. */
const ENTITY = '¶';

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** `{TEXTDATA}`: printable ASCII but `"` and `,`. */
const isTextData = (c: number) => c >= 0x20 && c <= 0x7e && c !== DQUOTE && c !== COMMA;

/** A character no rule consumes in any state: outside printable ASCII, and not a line break. */
const isStall = (c: number) => (c < 0x20 || c > 0x7e) && c !== LF;

/** The lexed body: the full stream and each token's text as v12's lexer matched it. */
export interface Lexed {
  /** Trivia (comments, directives, a dropped `;`) included; ends in `Kind.EOF`. */
  tokens: TokenStream;
  /**
   * The text of token `j`: v12's image (line breaks as LF, a collapsed run as one, `'` where
   * v12 turned a quote, `""` kept). For `Kind.Error` and trivia, the source text of its range.
   */
  text(j: number): string;
}

/**
 * Lex the sankey body `src[from…]`. `view` comes from `sourceView` with core's default
 * options (every rewrite v12 ran for sankey).
 */
export function lex(src: string, from: number, view: SourceView): Lexed {
  return new SankeyLexer(src, from, view).run();
}

/** v12's text, and the source range each of its characters came from. */
interface V12Text {
  text: string;
  /** Source offset of each character. */
  start: Uint32Array;
  /** Source offset just past each character (past a whole CRLF, collapsed run or entity). */
  end: Uint32Array;
}

/**
 * The text v12's lexer received for the view text from `from` on: CRs as LFs, quotes and
 * entities rewritten ({@link rewrite}), then {@link prepare}.
 */
function v12Text(from: number, view: SourceView): V12Text {
  return prepare(rewrite(from, view));
}

/** The characters of v12's text before `prepareTextForParsing`, with their source ranges. */
interface Rewritten {
  chars: string[];
  start: Uint32Array;
  end: Uint32Array;
}

/** v12's rewrites before sankey's own: CRs as LFs, tag quotes as `'`, entities. */
function rewrite(from: number, view: SourceView): Rewritten {
  const raw = view.text;
  const begin = localOffset(view, from);
  const offsets = view.runs ? new SourceOffsets(view.runs, begin) : undefined;
  const at = (q: number) => (offsets ? offsets.source(q) : q);
  const size = raw.length - begin;
  const chars: string[] = [];
  const start = new Uint32Array(size);
  const end = new Uint32Array(size);
  const put = (ch: string, a: number, b: number) => {
    start[chars.length] = a;
    end[chars.length] = b;
    chars.push(ch);
  };
  for (let q = begin; q < raw.length; q++) {
    const c = raw.charCodeAt(q);
    const a = at(q);
    const entity = c === HASH ? entityEnd(raw, q) : q;
    if (c === CR) {
      // A CRLF in the source is one line break; a CR and an LF that a removed span left side
      // by side were two to v12, which turned CRs into LFs before removing anything.
      const crlf = raw.charCodeAt(q + 1) === LF && at(q + 1) === a + 1;
      put('\n', a, a + (crlf ? 2 : 1));
      if (crlf) q++;
    } else if (c === DQUOTE && ((view.mask?.[a] ?? 0) & QUOTE) !== 0) {
      put("'", a, a + 1);
    } else if (entity > q) {
      put(ENTITY, a, at(entity) + 1);
      q = entity;
    } else put(raw[q] ?? '', a, a + 1);
  }
  return { chars, start, end };
}

/** The offset of the `;` ending an entity (`#\w+;`) at `q`, else `q`. */
function entityEnd(raw: string, q: number): number {
  let j = q + 1;
  while (j < raw.length && isWord(raw.charCodeAt(j))) j++;
  return j > q + 1 && raw.charCodeAt(j) === SEMI ? j : q;
}

/**
 * `prepareTextForParsing`: trim `\s` off both ends, and collapse each run of line breaks into
 * its first, whose source range then covers the run. Works in place.
 */
function prepare({ chars, start, end }: Rewritten): V12Text {
  let lo = 0;
  let hi = chars.length;
  while (lo < hi && isSpace((chars[lo] ?? '').charCodeAt(0))) lo++;
  while (hi > lo && isSpace((chars[hi - 1] ?? '').charCodeAt(0))) hi--;
  let m = 0;
  for (let i = lo; i < hi; i++) {
    if (chars[i] === '\n' && i > lo && chars[i - 1] === '\n') {
      end[m - 1] = end[i] ?? 0;
      continue;
    }
    chars[m] = chars[i] ?? '';
    start[m] = start[i] ?? 0;
    end[m] = end[i] ?? 0;
    m++;
  }
  chars.length = m;
  return { text: chars.join(''), start: start.subarray(0, m), end: end.subarray(0, m) };
}

/** One lex. Offsets are into v12's text; {@link emit} maps them to the source. */
class SankeyLexer {
  private readonly t: V12Text;
  private readonly text: string;
  private readonly len: number;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  private covered = 0;
  private readonly w: TokenWriter;
  /** The v12-text range of each token written; `-1` for trivia. */
  private readonly vStart: number[] = [];
  private readonly vEnd: number[] = [];
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private p = 0;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.t = v12Text(from, view);
    this.text = this.t.text;
    this.len = this.text.length;
    // About one token per five characters of sankey text.
    this.w = new TokenWriter(((this.len / 5) | 0) + 8);
  }

  run(): Lexed {
    while (this.p < this.len) this.step(this.text.charCodeAt(this.p));
    // At the end jison tries the rules once more on the empty input.
    this.emit(this.state === S.ESCAPED_TEXT ? T.EscapedText : T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    const tokens = this.w.finish(this.src);
    const { vStart, vEnd, text, src } = this;
    return {
      tokens,
      text: (j) => {
        const a = vStart[j] ?? -1;
        if (a >= 0 && tokens.kind[j] !== Kind.Error) return text.slice(a, vEnd[j]);
        return src.slice(tokens.start[j], tokens.end[j]);
      },
    };
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Write a trivia token (it has no v12 text). */
  private push(kind: number, a: number, b: number): void {
    this.w.push(kind, a, b);
    this.vStart.push(-1);
    this.vEnd.push(-1);
  }

  /**
   * Write the removed spans that start before `at` (a source offset) as trivia. A dropped `;`
   * that no token's range took is a `Space` token of its own.
   */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.push(Kind.Directive, h.start, h.end);
      else if (h.start >= this.covered) this.push(Kind.Space, h.start, h.end);
    }
  }

  /** The source offset of v12-text offset `s`; the end of the last character from `len` on. */
  private source(s: number): number {
    if (s < this.len) return this.t.start[s] ?? 0;
    return this.len > 0 ? (this.t.end[this.len - 1] ?? 0) : this.src.length;
  }

  /** Write the token `text[s, end)` with its source range, and move to `end`. */
  private emit(kind: number, s: number, end: number): void {
    const a = this.source(s);
    let b = end > s ? (this.t.end[end - 1] ?? a) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    this.vStart.push(s);
    this.vEnd.push(end);
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

  /** Whether the case-insensitive literal `word` (lower case) is at `q`, then `\b`. */
  private keyword(word: string, q: number): boolean {
    const { text } = this;
    if (q + word.length > this.len) return false;
    for (let k = 0; k < word.length; k++) {
      if (lower(text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return !isWord(text.charCodeAt(q + word.length));
  }

  /** The end of the run from `q` of characters that `test` takes. */
  private span(q: number, test: (c: number) => boolean): number {
    let j = q;
    while (j < this.len && test(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of `ESCAPED_TEXT` from `q`: `({TEXTDATA}|,|LF|"")*`. */
  private escaped(q: number): number {
    const { text } = this;
    let j = q;
    while (j < this.len) {
      const c = text.charCodeAt(j);
      if (c === DQUOTE) {
        if (text.charCodeAt(j + 1) !== DQUOTE) break;
        j += 2;
      } else if (isTextData(c) || c === COMMA || c === LF) j++;
      else break;
    }
    return j;
  }

  // --- States -------------------------------------------------------------------------------

  private step(c: number): void {
    const { p } = this;
    if (this.state === S.ESCAPED_TEXT) {
      // `"(?!")` closes the field; else `ESCAPED_TEXT`.
      if (c === DQUOTE && this.text.charCodeAt(p + 1) !== DQUOTE) {
        this.emit(T.CloseQuote, p, p + 1);
        this.state = this.stack.pop() ?? S.INITIAL;
        return;
      }
      const e = this.escaped(p);
      if (e > p) this.emit(T.EscapedText, p, e);
      else this.emit(Kind.Error, p, this.span(p, isStall));
      return;
    }
    if (this.state === S.INITIAL) {
      // `sankey-betax` is `sankey` then `-betax`: the `\b` fails after `beta`, not `sankey`.
      let word = this.keyword('sankey-beta', p) ? 11 : 0;
      if (word === 0 && this.keyword('sankey', p)) word = 6;
      if (word > 0) {
        this.emit(T.Sankey, p, p + word);
        this.stack.push(this.state);
        this.state = S.CSV;
        return;
      }
    }
    // INITIAL and csv share the rest, in this order.
    if (c === LF) this.emit(Kind.Newline, p, p + 1);
    else if (c === COMMA) this.emit(T.Comma, p, p + 1);
    else if (c === DQUOTE) {
      this.emit(T.OpenQuote, p, p + 1);
      this.stack.push(this.state);
      this.state = S.ESCAPED_TEXT;
    } else {
      const e = this.span(p, isTextData);
      if (e > p) this.emit(T.Text, p, e);
      else this.emit(Kind.Error, p, this.span(p, isStall));
    }
  }
}
