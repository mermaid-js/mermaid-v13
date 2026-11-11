// cspell:words betax
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
import { dropAt, tagQuotes } from '@mermaid-js/shared/parser/drop';
import type { Hole, Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { SankeyKind } from './tokens.ts';

// Start conditions of sankey.jison.
const STATE = { INITIAL: 0, CSV: 1, ESCAPED_TEXT: 2 } as const;
/** Start condition names by number, for the probe's lexer mode (R-LANG-7). */
const STATE_NAMES: readonly string[] = Object.entries(STATE)
  .sort((a, b) => a[1] - b[1])
  .map(([name]) => name);

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
 * options (every rewrite v12 ran for sankey). With a `probe`, the start condition at the
 * probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): Lexed {
  return new SankeyLexer(src, from, view).run(probe);
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

/**
 * v12's text before `prepareTextForParsing`, and the source range of each of its characters.
 * The text is built from slices of the view's text, not a string per character.
 */
interface Rewritten {
  text: string;
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
  const start = new Uint32Array(size);
  const end = new Uint32Array(size);
  const parts: string[] = [];
  /** Where the raw text not yet copied starts. */
  let copied = begin;
  let n = 0;
  /** `ch` in place of `raw[q, next)`. */
  const replace = (q: number, next: number, ch: string) => {
    parts.push(raw.slice(copied, q), ch);
    copied = next;
  };
  for (let q = begin; q < raw.length; q++) {
    const c = raw.charCodeAt(q);
    const a = at(q);
    start[n] = a;
    end[n] = a + 1;
    n++;
    if (c === CR) {
      // A CRLF in the source is one line break; a CR and an LF that a removed span left side
      // by side were two to v12, which turned CRs into LFs before removing anything.
      const crlf = raw.charCodeAt(q + 1) === LF && at(q + 1) === a + 1;
      end[n - 1] = a + (crlf ? 2 : 1);
      replace(q, crlf ? q + 2 : q + 1, '\n');
      if (crlf) q++;
    } else if (c === DQUOTE && ((view.mask?.[a] ?? 0) & QUOTE) !== 0) {
      replace(q, q + 1, "'");
    } else if (c === HASH) {
      const entity = entityEnd(raw, q);
      if (entity === q) continue;
      end[n - 1] = at(entity) + 1;
      replace(q, entity + 1, ENTITY);
      q = entity;
    }
  }
  parts.push(raw.slice(copied));
  return { text: parts.join(''), start: start.subarray(0, n), end: end.subarray(0, n) };
}

/** The offset of the `;` ending an entity (`#\w+;`) at `q`, else `q`. */
function entityEnd(raw: string, q: number): number {
  let j = q + 1;
  while (j < raw.length && isWord(raw.charCodeAt(j))) j++;
  return j > q + 1 && raw.charCodeAt(j) === SEMI ? j : q;
}

/**
 * `prepareTextForParsing`: trim `\s` off both ends, and collapse each run of line breaks into
 * its first, whose source range then covers the run. The ranges are compacted in place.
 */
function prepare({ text, start, end }: Rewritten): V12Text {
  let lo = 0;
  let hi = text.length;
  while (lo < hi && isSpace(text.charCodeAt(lo))) lo++;
  while (hi > lo && isSpace(text.charCodeAt(hi - 1))) hi--;
  const parts: string[] = [];
  /** Where the text not yet copied starts. */
  let copied = lo;
  let m = 0;
  for (let i = lo; i < hi; i++) {
    if (i > lo && text.charCodeAt(i) === LF && text.charCodeAt(i - 1) === LF) {
      end[m - 1] = end[i] ?? 0;
      if (copied < i) parts.push(text.slice(copied, i));
      copied = i + 1;
      continue;
    }
    start[m] = start[i] ?? 0;
    end[m] = end[i] ?? 0;
    m++;
  }
  parts.push(text.slice(copied, hi));
  return { text: parts.join(''), start: start.subarray(0, m), end: end.subarray(0, m) };
}

/** One lex. Offsets are into v12's text; {@link emit} maps them to the source. */
class SankeyLexer {
  private readonly v12: V12Text;
  private readonly text: string;
  private readonly len: number;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  private covered = 0;
  private readonly writer: TokenWriter;
  /** The v12-text range of each token written; `-1` for trivia. */
  private readonly vStart: number[] = [];
  private readonly vEnd: number[] = [];
  private readonly stack: number[] = [];
  private state: number = STATE.INITIAL;
  private p = 0;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.v12 = v12Text(from, view);
    this.text = this.v12.text;
    this.len = this.text.length;
    // About one token per five characters of sankey text.
    this.writer = new TokenWriter(((this.len / 5) | 0) + 8);
  }

  run(probe?: Probe): Lexed {
    // Two loops, so a plain lex does no probe work per step.
    if (probe !== undefined) this.probed(probe);
    while (this.p < this.len) this.step(this.text.charCodeAt(this.p));
    // At the end jison tries the rules once more on the empty input.
    this.emit(
      this.state === STATE.ESCAPED_TEXT ? SankeyKind.EscapedText : SankeyKind.Eof,
      this.len,
      this.len
    );
    this.trivia(this.src.length + 1);
    const tokens = this.writer.finish(this.src);
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

  /**
   * Lex up to the probe's offset, telling the probe each step's state, then stop: past the
   * offset the probe has its mode, and the plain loop lexes the rest.
   */
  private probed(probe: Probe): void {
    const o = probe.offset;
    while (this.p < this.len) {
      const before = this.source(this.p);
      const state = this.state;
      this.step(this.text.charCodeAt(this.p));
      const after = this.source(this.p);
      // An opening quote is read in the state before it, a closing one in the one it leaves.
      probe.lexed(before, after, STATE_NAMES[state] ?? '');
      if (before >= o || after > o) return;
    }
    probe.lexed(this.src.length, this.src.length, STATE_NAMES[this.state] ?? '');
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Write a trivia token (it has no v12 text). */
  private push(kind: number, a: number, b: number): void {
    this.writer.push(kind, a, b);
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
    if (s < this.len) return this.v12.start[s] ?? 0;
    return this.len > 0 ? (this.v12.end[this.len - 1] ?? 0) : this.src.length;
  }

  /** Write the token `text[s, end)` with its source range, and move to `end`. */
  private emit(kind: number, s: number, end: number): void {
    const a = this.source(s);
    let b = end > s ? (this.v12.end[end - 1] ?? a) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = dropAt(this.holes, this.hole, b);
    }
    this.writer.push(kind, a, b);
    this.vStart.push(s);
    this.vEnd.push(end);
    if (b > this.covered) this.covered = b;
    this.p = end;
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
    if (this.state === STATE.ESCAPED_TEXT) {
      // `"(?!")` closes the field; else `ESCAPED_TEXT`.
      if (c === DQUOTE && this.text.charCodeAt(p + 1) !== DQUOTE) {
        this.emit(SankeyKind.CloseQuote, p, p + 1);
        this.state = this.stack.pop() ?? STATE.INITIAL;
        return;
      }
      const e = this.escaped(p);
      if (e > p) this.emit(SankeyKind.EscapedText, p, e);
      else this.emit(Kind.Error, p, this.span(p, isStall));
      return;
    }
    if (this.state === STATE.INITIAL) {
      // `sankey-betax` is `sankey` then `-betax`: the `\b` fails after `beta`, not `sankey`.
      let word = this.keyword('sankey-beta', p) ? 11 : 0;
      if (word === 0 && this.keyword('sankey', p)) word = 6;
      if (word > 0) {
        this.emit(SankeyKind.Sankey, p, p + word);
        this.stack.push(this.state);
        this.state = STATE.CSV;
        return;
      }
    }
    // INITIAL and csv share the rest, in this order.
    if (c === LF) this.emit(Kind.Newline, p, p + 1);
    else if (c === COMMA) this.emit(SankeyKind.Comma, p, p + 1);
    else if (c === DQUOTE) {
      this.emit(SankeyKind.OpenQuote, p, p + 1);
      this.stack.push(this.state);
      this.state = STATE.ESCAPED_TEXT;
    } else {
      const e = this.span(p, isTextData);
      if (e > p) this.emit(SankeyKind.Text, p, e);
      else this.emit(Kind.Error, p, this.span(p, isStall));
    }
  }
}
