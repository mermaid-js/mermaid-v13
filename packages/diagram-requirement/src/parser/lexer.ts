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
  GT,
  HASH,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  LT,
  PERCENT,
  QUOTE,
  RBRACE,
  SEMI,
  sourceView,
  SPACE,
} from '@mermaid-js/core/parser-kit';
import { lowerCode, StateLexer } from '@mermaid-js/shared/parser/state';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { StateLexerOptions } from '@mermaid-js/shared/parser/state';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { KEYWORD_SPELLINGS, T } from './tokens.ts';

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
const KEYWORDS: readonly (readonly [word: string, kind: number])[] = KEYWORD_SPELLINGS.map(
  ([kind, spelling]) => [spelling.toLowerCase(), kind] as const
);
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
 * Where the requirement body of `src` starts and its source view (what v12's preprocessing
 * removed and rewrote), as `lex` takes them: the one path of the parser and the lexer gate.
 * `pre` is `src`'s preprocess result, when the caller has it.
 */
export function requirementView(
  src: string,
  pre: PreprocessResult = preprocess(src)
): { from: number; view: SourceView } {
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { from: pre.bodyStart, view };
}

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 4, crlf: 'fold', dropSpace: true };

/**
 * Lex the requirement body `src[from…]`. `from` and `view` come from {@link requirementView}.
 * With a `probe`, the start condition at its offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): Lexed {
  const tokens = new RequirementLexer(src, from, view, OPTIONS).run(probe);
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
class RequirementLexer extends StateLexer {
  /** jison's condition stack. */
  protected override readonly stack: number[] = [S.INITIAL];
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

  /**
   * `text` with v12's other rewrites that change what a rule matches, each in place (the
   * length is kept): a `"` that v12's `cleanupText` turned into `'` reads `'`, and each
   * `#name;` entity reads `ﬂ`, the name and `¶`, so no rule takes its `#` or `;` (v12's
   * placeholders `ﬂ°…¶ß` are not `\w`, blanks or a rule's punctuation either).
   */
  protected override prepare(text: string, { mask }: SourceView): string {
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

  run(probe?: Probe): TokenStream {
    const { n } = this;
    this.trim();
    if (probe) {
      while (this.p < n) {
        const mode = S_NAMES[this.top()] ?? '';
        const before = this.p;
        this.step();
        probe.lexed(this.source(before), this.source(this.p), mode);
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.top()] ?? '');
    } else while (this.p < n) this.step();
    // jison's last match, on the empty rest of the input.
    const end = this.len;
    switch (this.top()) {
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

  private top(): number {
    return this.stack[this.stack.length - 1] ?? S.INITIAL;
  }

  // --- Offsets and output -------------------------------------------------------------------

  /**
   * Write the token `text[s, end)` with its source range, and move to `consumed` (past text
   * the rule matched but the token leaves out: an unquoted string's trailing blanks).
   */
  protected override emit(kind: number, s: number, end: number, consumed = end): void {
    super.emit(kind, s, end, this.p);
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

  // --- Scans --------------------------------------------------------------------------------

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

  // --- Rules --------------------------------------------------------------------------------

  protected step(): void {
    const { text, p } = this;
    const c = text.charCodeAt(p);
    switch (this.top()) {
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
        const kind = this.top() === S.ACC_TITLE ? T.AccTitleValue : T.AccDescrValue;
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
    const lc = lowerCode(c);
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
      this.blankRun();
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
  private blankRun(): void {
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
    const pair = String.fromCharCode(
      lowerCode(text.charCodeAt(w)),
      lowerCode(text.charCodeAt(w + 1))
    );
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
