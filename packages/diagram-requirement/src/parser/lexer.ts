// cspell:words unput requirementdiagram functionalrequirement interfacerequirement acctitle
// cspell:words performancerequirement physicalrequirement designconstraint accdescr
/**
 * Requirement lexer: a state machine mirroring the start conditions and rule order of v12's
 * `requirementDiagram.jison` (parser-method §1), built on the venn lexer's source mapping:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}),
 *   line breaks as v12 had them (CRLF and CR as LF), each `#name;` entity as an opaque run
 *   (v12's placeholder: no rule takes its `#` or `;`) and each `"` v12 turned into `'` as
 *   `'`, and maps each token back to its range in the source, which is never rewritten. A
 *   token that runs over a removed span is one token whose range covers it;
 * - comments and directives v12 removed are trivia tokens, each with its own range, in source
 *   order; so is a dropped `;` that no token took (`Space`). Skipped blanks are no token.
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only) and each keyword ends in `\b`; `\w` is ASCII; the
 * `#…` and `%…` comment rules apply only at a token start; `title\s` takes one `\s` of any
 * kind, a line break too; `[^\n]` stops at LF only, `.` at every line terminator. In the
 * style state (after `style`, `classDef`, `class`) a space is skipped, a line break ends the
 * state with no token, and a tab, `.`, `(` or any other character is an error. Quotes begin
 * the string state from the initial and the style state; a text that ends inside quotes, an
 * `accTitle:`/`accDescr:` value or an `accDescr {` block ends with an empty value token, and
 * one that ends in the initial state with a zero-width `EOF`.
 *
 * Two rules follow the maintainer's decisions instead of v12 (spec #520, both listed in the
 * lexer-parity gate):
 * - D431: v12's `\s+` comes after `(\r?\n)+` but takes line breaks too, so a blank before a
 *   line end swallowed it. Here a blank run that follows other text on its line ends at its
 *   first line break, which is then a {@link T.NewlineAfterBlank} run. A blank run at the
 *   start of a line (after only blanks since the last line break) is skipped whole, line
 *   breaks included, as in v12.
 * - D432: v12's `.*direction\s+(TB|BT|RL|LR)[^\n]*` matched at any token start, anything
 *   earlier and later on the line going into the token. Here a direction token is only
 *   `direction`, blanks and `TB`, `BT`, `RL` or `LR` (case-insensitive, then `\b`) at the start
 *   of a line; the rest of the line, and every other line, lexes as usual.
 *
 * jison throws where no rule matches; that is a one-character `Kind.Error` (a code point) and
 * lexing goes on in the same state. Every scan is linear in the text it consumes (R-PARSE-7):
 * the direction rule reads a few characters at a line start only (v12's rescans the rest of
 * the line at every token, quadratic on a long line), and the scans to the next quote and the
 * next `}` are cached.
 */
import {
  codePointEnd,
  COLON,
  COMMA,
  cook,
  CR,
  DASH,
  DQUOTE,
  EQUALS,
  firstHole,
  GT,
  HASH,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  localOffset,
  LT,
  PERCENT,
  QUOTE,
  RBRACE,
  SEMI,
  SourceOffsets,
  SPACE,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of requirementDiagram.jison that rules enter (`token` and `unqString` are
// declared there but never entered).
const S = {
  INITIAL: 0,
  STRING: 1,
  STYLE: 2,
  ACC_TITLE: 3,
  ACC_DESCR: 4,
  ACC_DESCR_MULTILINE: 5,
} as const;
/** Start condition names by number, for the probe's lexer mode. */
const S_NAMES = ['INITIAL', 'string', 'style', 'accTitle', 'accDescr', 'accDescrMultiline'];

const APOS = "'";

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** Not in `[^#\n;]` (a title). */
const isTitleStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** Not in `[^:,\r\n\{\<\>\-\=]` (an unquoted string). */
const isUnqStop = (c: number) =>
  c === COLON ||
  c === COMMA ||
  c === CR ||
  c === LF ||
  c === LBRACE ||
  c === LT ||
  c === GT ||
  c === DASH ||
  c === EQUALS;

/** Blanks within a line: `\s` less the line terminators. */
const isLineBlank = (c: number) => isSpace(c) && !isLineEnd(c);

/**
 * The keyword rules in jison's order (lower case), each with `\b` after it, by first letter.
 * `style`, `classDef` and `class` begin the style state.
 */
export const KEYWORDS: readonly (readonly [word: string, kind: number])[] = [
  ['requirementdiagram', T.Rd],
  ['id', T.Id],
  ['text', T.Text],
  ['risk', T.Risk],
  ['verifymethod', T.VerifyMethod],
  ['requirement', T.Requirement],
  ['functionalrequirement', T.FunctionalRequirement],
  ['interfacerequirement', T.InterfaceRequirement],
  ['performancerequirement', T.PerformanceRequirement],
  ['physicalrequirement', T.PhysicalRequirement],
  ['designconstraint', T.DesignConstraint],
  ['low', T.LowRisk],
  ['medium', T.MedRisk],
  ['high', T.HighRisk],
  ['analysis', T.VerifyAnalysis],
  ['demonstration', T.VerifyDemonstration],
  ['inspection', T.VerifyInspection],
  ['test', T.VerifyTest],
  ['element', T.Element],
  ['contains', T.Contains],
  ['copies', T.Copies],
  ['derives', T.Derives],
  ['satisfies', T.Satisfies],
  ['verifies', T.Verifies],
  ['refines', T.Refines],
  ['traces', T.Traces],
  ['type', T.Type],
  ['docref', T.DocRef],
  ['style', T.Style],
  ['classdef', T.ClassDef],
  ['class', T.Class],
];
const BEGINS_STYLE: ReadonlySet<number> = new Set([T.Style, T.ClassDef, T.Class]);
const KEYWORDS_BY_LETTER: ReadonlyMap<number, readonly (readonly [string, number])[]> =
  /* @__PURE__ */ (() => {
    const out = new Map<number, (readonly [string, number])[]>();
    for (const entry of KEYWORDS) {
      const c = entry[0].charCodeAt(0);
      const list = out.get(c) ?? [];
      list.push(entry);
      out.set(c, list);
    }
    return out;
  })();

/** The direction rules' kinds and words, in jison's order. */
const DIRECTION_KINDS = [T.DirectionTB, T.DirectionBT, T.DirectionRL, T.DirectionLR];
const DIRECTIONS = ['tb', 'bt', 'rl', 'lr'];

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}). An unquoted string's range is already trimmed, a quoted string's holds
   * no quotes. Read token text only through this.
   */
  text(j: number): string;
  /** The same text for a token given by its range, for a parser reading a token view. */
  textOf(start: number, end: number): string;
}

/**
 * Lex the requirement body `src[from…]`. `from` and `view` come from `requirementView`
 * (`./index.ts`). With a `probe`, the start condition at its offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): Lexed {
  const tokens = new RequirementLexer(src, from, view).run(probe);
  const textOf = (start: number, end: number): string => cook(src, start, end, view);
  return {
    tokens,
    textOf,
    text: (j) => textOf(tokens.start[j] ?? 0, tokens.end[j] ?? 0),
  };
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 */
class RequirementLexer {
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
  /** jison's condition stack. */
  private readonly stack: number[] = [S.INITIAL];
  private p: number;
  /**
   * Whether everything consumed since the last line break (or the start) is blank: the next
   * token starts a line (D431, D432). What jison had matched so far ends in a line break and
   * blanks.
   */
  private clean = true;
  /** The next `"` at or after the last lookup (-2: not looked up; -1: none). */
  private nextQuote = -2;
  /** The next `}` at or after the last lookup (-2: not looked up; -1: none). */
  private nextBrace = -2;

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
    // About one token per four characters of requirement text.
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
   * `text` with v12's other rewrites that change what a rule matches, each in place (the
   * length is kept): a `"` that v12's `cleanupText` turned into `'` reads `'`, and each
   * `#name;` entity reads `ﬂ`, the name and `¶`, so no rule takes its `#` or `;` (v12's
   * placeholders `ﬂ°…¶ß` are not `\w`, blanks or a rule's punctuation either).
   */
  private placeholders(text: string, mask: Uint8Array | undefined): string {
    let out = text;
    if (mask && out.includes('"')) {
      const parts: string[] = [];
      let run = 0;
      for (let q = out.indexOf('"'); q !== -1; q = out.indexOf('"', q + 1)) {
        if (((mask[this.source(q)] ?? 0) & QUOTE) === 0) continue;
        parts.push(out.slice(run, q), APOS);
        run = q + 1;
      }
      parts.push(out.slice(run));
      out = parts.join('');
    }
    if (out.includes('#')) out = out.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`);
    return out;
  }

  /** Whether view-text offsets `q` and `q + 1` are next to each other in the source. */
  private adjacent(q: number): boolean {
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1;
  }

  run(probe?: Probe): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    if (probe) {
      while (this.p < n) {
        const mode = S_NAMES[this.state()] ?? '';
        const before = this.p;
        this.step();
        probe.lexed(this.source(before), this.source(this.p), mode);
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state()] ?? '');
    } else while (this.p < n) this.step();
    // jison's last match, on the empty rest of the input.
    const end = this.len;
    switch (this.state()) {
      case S.INITIAL:
        this.emit(T.Eof, end, end);
        break;
      case S.STRING:
        this.emit(T.QString, end, end);
        break;
      case S.ACC_TITLE:
        this.emit(T.AccTitleValue, end, end);
        break;
      case S.ACC_DESCR:
        this.emit(T.AccDescrValue, end, end);
        break;
      case S.ACC_DESCR_MULTILINE:
        this.emit(T.AccDescrMultilineValue, end, end);
        break;
      default:
      // The style state has no rule for the empty input: jison ends with `$end` alone.
    }
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  private state(): number {
    return this.stack[this.stack.length - 1] ?? S.INITIAL;
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

  /**
   * Write the token `text[s, end)` with its source range, and move to `consumed` (past text
   * the rule matched but the token leaves out: an unquoted string's trailing blanks).
   */
  private emit(kind: number, s: number, end: number, consumed = end): void {
    const a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.sourceEnd(last - 1) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    if (b > this.covered) this.covered = b;
    this.advance(consumed);
  }

  /** Move to `to`, keeping {@link clean} up to date with the text passed. */
  private advance(to: number): void {
    const { text } = this;
    for (let i = to - 1; i >= this.p; i--) {
      const c = text.charCodeAt(i);
      if (c === LF) {
        this.clean = true;
        break;
      }
      if (!isSpace(c)) {
        this.clean = false;
        break;
      }
    }
    this.p = to;
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

  /** The end of the run of `\s` from `q`. */
  private spaces(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The first LF at or after `q` (the appended one at the latest). */
  private lineEnd(q: number): number {
    const e = this.text.indexOf('\n', q);
    return e === -1 ? this.n : e;
  }

  /** The first `"` at or after `q`, or the end. `q` never decreases between calls. */
  private quote(q: number): number {
    let e = this.nextQuote;
    if (e === -2 || (e !== -1 && e < q)) this.nextQuote = e = this.text.indexOf('"', q);
    return e === -1 ? this.n : e;
  }

  /** The first `}` at or after `q`, or the end. `q` never decreases between calls. */
  private brace(q: number): number {
    let e = this.nextBrace;
    if (e === -2 || (e !== -1 && e < q)) this.nextBrace = e = this.text.indexOf('}', q);
    return e === -1 ? this.n : e;
  }

  /** Whether the case-insensitive literal `word` (lower case) is at `q`. */
  private literal(word: string, q: number): boolean {
    if (q + word.length > this.n) return false;
    for (let k = 0; k < word.length; k++) {
      if (lower(this.text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return true;
  }

  // --- Rules --------------------------------------------------------------------------------

  private step(): void {
    const { text, p } = this;
    const c = text.charCodeAt(p);
    switch (this.state()) {
      case S.INITIAL:
        this.initial(c);
        return;
      case S.STRING:
        // `["]` pops; `[^"]*` is the string.
        if (c === DQUOTE) {
          this.stack.pop();
          this.emit(T.Quote, p, p + 1);
        } else this.emit(T.QString, p, this.quote(p));
        return;
      case S.STYLE:
        this.style(c);
        return;
      case S.ACC_TITLE:
      case S.ACC_DESCR: {
        // `(?!\n|;|#)*[^\n]*` (jison compiled the lookahead to nothing), then back.
        const kind = this.state() === S.ACC_TITLE ? T.AccTitleValue : T.AccDescrValue;
        this.stack.pop();
        this.emit(kind, p, this.lineEnd(p));
        return;
      }
      default:
        // acc_descr_multiline: `[\}]` pops (no token); `[^\}]*` is the value.
        if (c === RBRACE) {
          this.stack.pop();
          this.emit(T.AccDescrClose, p, p + 1);
        } else this.emit(T.AccDescrMultilineValue, p, this.brace(p));
    }
  }

  /** The initial state's rules, in jison's order. */
  private initial(c: number): void {
    const { text, p } = this;
    const lc = lower(c);
    // 0: `title\s[^#\n;]+`.
    if (lc === 0x74 && this.title()) return;
    // 1, 3, 5: `accTitle\s*:\s*`, `accDescr\s*:\s*`, `accDescr\s*\{\s*`.
    if (lc === 0x61 && this.acc()) return;
    // 8–11: `direction XX`, at a line start only (D432).
    if (this.clean && lc === 0x64 && this.direction()) return;
    // 12: `(\r?\n)+` (CRs are LFs by now).
    if (c === LF) {
      this.emit(Kind.Newline, p, this.newlines(p));
      return;
    }
    // 13: `\s+`, skipped (D431).
    if (isSpace(c)) {
      this.blanks();
      return;
    }
    // 14, 15: `\#[^\n]*`, `\%%[^\n]*` (compiled to `%[^\n]*`), skipped.
    if (c === HASH || c === PERCENT) {
      this.emit(Kind.Comment, p, this.lineEnd(p));
      return;
    }
    if (this.keyword(lc) || this.punctuation(c)) return;
    // 67: `[\w][^:,\r\n\{\<\>\-\=]*`, trimmed.
    if (isWord(c)) {
      let e = p + 1;
      while (e < this.n && !isUnqStop(text.charCodeAt(e))) e++;
      let t = e;
      while (isSpace(text.charCodeAt(t - 1))) t--;
      this.emit(T.UnqString, p, t, e);
      return;
    }
    this.emit(Kind.Error, p, codePointEnd(text, p));
  }

  /** `{`, `}`, `:::`, `:`, then `<-`, `->`, `-`, `"` and `,`, in jison's order. */
  private punctuation(c: number): boolean {
    const { text, p } = this;
    switch (c) {
      case LBRACE:
        this.emit(T.StructStart, p, p + 1);
        return true;
      case RBRACE:
        this.emit(T.StructStop, p, p + 1);
        return true;
      case COLON:
        if (text.charCodeAt(p + 1) === COLON && text.charCodeAt(p + 2) === COLON)
          this.emit(T.StyleSeparator, p, p + 3);
        else this.emit(T.ColonSep, p, p + 1);
        return true;
      case LT:
        if (text.charCodeAt(p + 1) === DASH) {
          this.emit(T.EndArrowL, p, p + 2);
          return true;
        }
        break;
      case DASH:
        if (text.charCodeAt(p + 1) === GT) this.emit(T.EndArrowR, p, p + 2);
        else this.emit(T.Line, p, p + 1);
        return true;
      case DQUOTE:
        this.stack.push(S.STRING);
        this.emit(T.Quote, p, p + 1);
        return true;
      case COMMA:
        this.emit(T.Comma, p, p + 1);
        return true;
      default:
    }
    return false;
  }

  /** The end of the run of LFs from `q`. */
  private newlines(q: number): number {
    let e = q + 1;
    while (this.text.charCodeAt(e) === LF) e++;
    return e;
  }

  /**
   * `\s+` (D431). At a line start the whole run is skipped, line breaks included, as in v12.
   * After other text on the line it ends at its first line break, and the run of line breaks
   * there is a {@link T.NewlineAfterBlank}.
   */
  private blanks(): void {
    const { text, p } = this;
    if (this.clean) {
      this.advance(this.spaces(p));
      return;
    }
    let e = p + 1;
    while (e < this.n && isSpace(text.charCodeAt(e)) && text.charCodeAt(e) !== LF) e++;
    this.advance(e);
    if (text.charCodeAt(e) === LF) this.emit(T.NewlineAfterBlank, e, this.newlines(e));
  }

  /** `"title"\s[^#\n;]+`, at a `t`. */
  private title(): boolean {
    const { text, p } = this;
    if (!this.literal('title', p) || !isSpace(text.charCodeAt(p + 5))) return false;
    let e = p + 6;
    while (e < this.n && !isTitleStop(text.charCodeAt(e))) e++;
    if (e === p + 6) return false;
    this.emit(T.Title, p, e);
    return true;
  }

  /** The three `acc…` openers, at an `a`. */
  private acc(): boolean {
    const { text, p } = this;
    const title = this.literal('acctitle', p);
    if (!title && !this.literal('accdescr', p)) return false;
    const j = this.spaces(p + 8);
    const mark = text.charCodeAt(j);
    if (mark === COLON) {
      this.stack.push(title ? S.ACC_TITLE : S.ACC_DESCR);
      this.emit(title ? T.AccTitle : T.AccDescr, p, this.spaces(j + 1));
      return true;
    }
    if (mark === LBRACE && !title) {
      this.stack.push(S.ACC_DESCR_MULTILINE);
      this.emit(T.AccDescrOpen, p, this.spaces(j + 1));
      return true;
    }
    return false;
  }

  /**
   * A direction at a line start (D432): `direction`, blanks (no line break), one of the four
   * directions and `\b`, case-insensitive.
   */
  private direction(): boolean {
    const { text, p } = this;
    if (!this.literal('direction', p)) return false;
    let w = p + 9;
    while (isLineBlank(text.charCodeAt(w))) w++;
    if (w === p + 9 || isWord(text.charCodeAt(w + 2))) return false;
    const pair = String.fromCharCode(lower(text.charCodeAt(w)), lower(text.charCodeAt(w + 1)));
    const d = DIRECTIONS.indexOf(pair);
    if (d < 0) return false;
    this.emit(DIRECTION_KINDS[d] ?? T.DirectionTB, p, w + 2);
    return true;
  }

  /** The keyword rules, each with `\b`, in jison's order. */
  private keyword(lc: number): boolean {
    const list = KEYWORDS_BY_LETTER.get(lc);
    if (!list) return false;
    const { text, p } = this;
    for (const [word, kind] of list) {
      if (!this.literal(word, p) || isWord(text.charCodeAt(p + word.length))) continue;
      if (BEGINS_STYLE.has(kind)) this.stack.push(S.STYLE);
      this.emit(kind, p, p + word.length);
      return true;
    }
    return false;
  }

  /** The style state's rules (and the `<*>` ones), in jison's order. */
  private style(c: number): void {
    const { text, p } = this;
    if (isWord(c)) {
      let e = p + 1;
      while (isWord(text.charCodeAt(e))) e++;
      this.emit(T.Alpha, p, e);
      return;
    }
    switch (c) {
      case COLON:
        this.emit(T.Colon, p, p + 1);
        return;
      case SEMI:
        this.emit(T.Semicolon, p, p + 1);
        return;
      case PERCENT:
        this.emit(T.Percent, p, p + 1);
        return;
      case DASH:
        this.emit(T.Minus, p, p + 1);
        return;
      case HASH:
        this.emit(T.Brkt, p, p + 1);
        return;
      case SPACE: {
        // `" "`: skipped, one at a time.
        let e = p + 1;
        while (text.charCodeAt(e) === SPACE) e++;
        this.advance(e);
        return;
      }
      case DQUOTE:
        this.stack.push(S.STRING);
        this.emit(T.Quote, p, p + 1);
        return;
      case LF:
        this.stack.pop();
        this.emit(T.StyleEnd, p, p + 1);
        return;
      case COMMA:
        this.emit(T.Comma, p, p + 1);
        return;
      default:
        this.emit(Kind.Error, p, codePointEnd(text, p));
    }
  }
}
