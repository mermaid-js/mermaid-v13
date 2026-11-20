/**
 * Journey lexer: a state machine mirroring the start conditions and rule order of v12's
 * `journey.jison` (parser-method §1), modelled on the sequence lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `%…`, `x%%…` and `#…` comments the jison lexer skipped.
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only); `journey` ends in `\b` (ASCII word characters); `\n`
 * in a rule is LF only, while `\s` takes every line terminator. Every rule matches somewhere,
 * so jison never throws on journey text: a `;` is its `INVALID` token. Every scan is linear in
 * the text it consumes (R-PARSE-7).
 */
// cspell:words acctitle accdescr
import {
  COLON,
  CR,
  HASH,
  isSpace,
  Kind,
  LBRACE,
  LF,
  PERCENT,
  type Probe,
  RBRACE,
  SEMI,
  type SourceView,
  type TokenStream,
} from '@mermaid-js/core/parser-kit';
import {
  lexerText,
  lowerCode,
  StateLexer,
  type StateLexerOptions,
} from '@mermaid-js/shared/parser/state';
import { T } from './tokens.ts';

// Start conditions of journey.jison (all exclusive).
const S = {
  INITIAL: 0,
  acc_title: 1,
  acc_descr: 2,
  acc_descr_multiline: 3,
} as const;

/** Start condition names by number, for the probe's lexer mode. */
const S_NAMES: readonly string[] = ['INITIAL', 'acc_title', 'acc_descr', 'acc_descr_multiline'];

/** A regex `\w` without the `u` flag: `[A-Za-z0-9_]` (what jison's `\b` reads). */
const isAsciiWord = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** Not in `[^#\n;]` (`title`, `taskData`). */
const isLineStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** Not in `[^#:\n;]` (`section`, `taskName`). */
const isNameStop = (c: number) => isLineStop(c) || c === COLON;

const LOWER_A = 0x61;
const LOWER_J = 0x6a;
const LOWER_S = 0x73;
const LOWER_T = 0x74;

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 8, crlf: 'keep', dropSpace: false };

/**
 * Lex the journey body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new JourneyLexer(src, from, view, OPTIONS).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class JourneyLexer extends StateLexer {
  /**
   * The text the lexer reads, of the same length as the view's text: v12 turned every CRLF and
   * CR into LF before lexing, so every CR reads as LF (a CRLF as two, which every rule treats as
   * one run except a single `\s` and the character before `%%`, where the lexer steps over the
   * pair); each `#name;` entity is `ﬂ`, the name and `¶`, so no rule takes its `#` or `;` (v12's
   * placeholders).
   */
  protected override prepare(text: string): string {
    return lexerText(text);
  }

  run(probe?: Probe): TokenStream {
    this.trim();
    this.loop(probe, S_NAMES);
    // At the end jison tries the rules once more on the empty input: an accessibility state's
    // value rule matches it (empty), INITIAL's `<<EOF>>` does. jison then returns `$end`
    // without trying `<<EOF>>`, but v13 always ends in `EOF` (a gate exclusion).
    const kind = this.endKind();
    if (kind !== T.Eof) this.emit(kind, this.len, this.len);
    this.emit(T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The token the current state's rules give on the empty input at the end. */
  private endKind(): number {
    switch (this.state) {
      case S.acc_title:
        return T.AccTitleValue;
      case S.acc_descr:
        return T.AccDescrValue;
      case S.acc_descr_multiline:
        return T.AccDescrMultilineValue;
      default:
        return T.Eof;
    }
  }

  // --- Offsets and output -------------------------------------------------------------------

  protected override emit(kind: number, s: number, end: number, next: number = end): true {
    super.emit(kind, s, end, next);
    return true;
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of characters `stop` rejects, from `q`. */
  private runOf(q: number, stop: (c: number) => boolean): number {
    let j = q;
    while (j < this.n && !stop(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `q` plus the width of one v12 character there: a CRLF was one LF. */
  private oneChar(q: number): number {
    return q + (this.raw.charCodeAt(q) === CR && this.raw.charCodeAt(q + 1) === LF ? 2 : 1);
  }

  // --- States -------------------------------------------------------------------------------

  protected step(c: number): void {
    switch (this.state) {
      case S.INITIAL:
        this.initial(c);
        return;
      case S.acc_title:
      case S.acc_descr:
        this.accValue();
        return;
      default:
        this.accDescrMultiline(c);
    }
  }

  /** The INITIAL rules in file order. One always matches (`.` takes what the others leave). */
  private initial(c: number): true {
    const { text, p } = this;
    // `\%%(?!\{)[^\n]*`, which jison reads as `%(?!\{)[^\n]*`: one `%` will do.
    if (c === PERCENT && text.charCodeAt(p + 1) !== LBRACE)
      return this.emit(Kind.Comment, p, this.lineEnd(p));
    // `[^\}]%%[^\n]*`: takes the character before the `%%`, a line break included.
    if (c !== RBRACE) {
      const q = this.oneChar(p);
      if (text.charCodeAt(q) === PERCENT && text.charCodeAt(q + 1) === PERCENT)
        return this.emit(Kind.Comment, p, this.lineEnd(q));
    }
    // `[\n]+`
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      return this.emit(Kind.Newline, p, e);
    }
    // `\s+`: skipped, line breaks after a blank included.
    if (isSpace(c)) {
      this.p = this.spaces(p);
      return true;
    }
    // `#[^\n]*`
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    const l = lowerCode(c);
    if (l === LOWER_J && this.literal('journey', p) && !isAsciiWord(text.charCodeAt(p + 7)))
      return this.emit(T.Journey, p, p + 7);
    if (l === LOWER_T && this.keywordLine('title', T.Title, isLineStop)) return true;
    if (l === LOWER_A && this.acc()) return true;
    if (l === LOWER_S && this.keywordLine('section', T.Section, isNameStop)) return true;
    // `[^#:\n;]+`
    if (!isNameStop(c)) return this.emit(T.TaskName, p, this.runOf(p, isNameStop));
    // `:[^#\n;]+`, then `:`
    if (c === COLON) {
      const e = this.runOf(p + 1, isLineStop);
      return e > p + 1 ? this.emit(T.TaskData, p, e) : this.emit(T.Colon, p, p + 1);
    }
    // `.`: one code unit (`;`; `#` and line breaks were taken above).
    return this.emit(T.Invalid, p, p + 1);
  }

  /**
   * `title\s[^#\n;]+` and `section\s[^#:\n;]+`: the keyword, one `\s` (a line break too), and
   * at least one character `stop` rejects, all one token.
   */
  private keywordLine(word: string, kind: number, stop: (c: number) => boolean): boolean {
    const { p } = this;
    const q = p + word.length;
    if (!this.literal(word, p) || !isSpace(this.text.charCodeAt(q))) return false;
    const after = this.oneChar(q);
    const e = this.runOf(after, stop);
    if (e === after) return false;
    return this.emit(kind, p, e);
  }

  /** `accTitle\s*:\s*`, `accDescr\s*:\s*` and `accDescr\s*\{\s*`. */
  private acc(): boolean {
    const { text, p } = this;
    const title = this.literal('acctitle', p);
    if (!title && !this.literal('accdescr', p)) return false;
    const j = this.spaces(p + 8);
    const d = text.charCodeAt(j);
    if (d === COLON) {
      this.emit(title ? T.AccTitle : T.AccDescr, p, this.spaces(j + 1));
      this.pushState(title ? S.acc_title : S.acc_descr);
      return true;
    }
    if (title || d !== LBRACE) return false;
    this.emit(T.AccDescrMultiline, p, j + 1, this.spaces(j + 1));
    this.pushState(S.acc_descr_multiline);
    return true;
  }

  /** `(?!\n|;|#)*[^\n]*` (the quantified lookahead matches empty): the acc title or description. */
  private accValue(): void {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.popState();
    this.emit(kind, this.p, this.lineEnd(this.p));
  }

  /** `[\}]` (pops, no jison token) and `[^\}]*`. */
  private accDescrMultiline(c: number): void {
    const { text, p } = this;
    if (c === RBRACE) {
      this.popState();
      this.emit(T.AccDescrMultilineEnd, p, p + 1);
      return;
    }
    const e = text.indexOf('}', p);
    this.emit(T.AccDescrMultilineValue, p, e === -1 ? this.n : e);
  }
}
