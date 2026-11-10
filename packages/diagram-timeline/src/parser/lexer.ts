/**
 * Timeline lexer: a state machine mirroring the start conditions and rule order of v12's
 * `timeline.jison` (parser-method §1), modelled on the sequence lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `#…`, `%…` and `x%%…` comments the jison lexer skipped, and a dropped `;` that no
 *   token took (`Space`).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only); the `timeline` keywords end in `\b`; the first rule,
 * written `\%%(?!\{)`, compiles to a single `%`; `\n` in a rule is LF only, while `\s` takes
 * every line terminator, so a bare `title` or `section` takes the next line. jison never throws
 * on timeline text: `\s+` and the last rule `.` take every character between them. Every scan
 * is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words acctitle accdescr
import { COLON, CR, HASH, isSpace, isWord, Kind, LBRACE, LF, PERCENT, RBRACE, SPACE, TAB } from '@mermaid-js/core/parser-kit';
import { lowerCode, StateLexer } from '@mermaid-js/core/parser-kit/state';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { StateLexerOptions } from '@mermaid-js/core/parser-kit/state';
import { T } from './tokens.ts';

// Start conditions of timeline.jison.
const S = {
  INITIAL: 0,
  acc_title: 1,
  acc_descr: 2,
  acc_descr_multiline: 3,
} as const;

/** Start condition names by number, for the probe's lexer mode (R-LANG-7). */
const S_NAMES = ['INITIAL', 'acc_title', 'acc_descr', 'acc_descr_multiline'];

const LOWER_A = 0x61;
const LOWER_S = 0x73;
const LOWER_T = 0x74;

/**
 * The text the lexer reads, of the same length as the view's text: v12 turned every CRLF and
 * CR into LF before lexing, so a CRLF reads as two LFs (every rule treats a run of line breaks
 * as one, except a single `\s` or a `[^\}]`, which the lexer steps over as a pair) and a lone
 * CR as LF; each `#name;` entity is `ﬂ`, the name and `¶`, so no rule takes its `#` (v12's
 * placeholders).
 */
function lexerText(text: string): string {
  let out = text.includes('\r')
    ? text.replace(/\r\n?/g, (m) => (m.length === 2 ? '\n\n' : '\n'))
    : text;
  if (out.includes('#')) out = out.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`);
  return out;
}

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 8, crlf: 'keep', dropSpace: true };

/**
 * Lex the timeline body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new TimelineLexer(src, from, view, OPTIONS).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class TimelineLexer extends StateLexer {
  /** Source offset where the last `acc…` keyword's value mode starts (after `:` or `{`). */
  private valueAt = 0;

  protected override prepare(text: string, view: SourceView): string {
    return lexerText(text);
  }

  run(probe?: Probe): TokenStream {
    const { text, n } = this;
    this.trim();
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) while (this.p < n) this.step(text.charCodeAt(this.p));
    else {
      while (this.p < n) {
        const before = this.source(this.p);
        const state = this.state;
        const depth = this.stack.length;
        this.step(text.charCodeAt(this.p));
        const after = this.source(this.p);
        if (this.stack.length > depth) {
          // An `acc…` keyword: after its `:` or `{` (the blanks it took too) the value starts.
          probe.lexed(before, this.valueAt, S_NAMES[state] ?? '');
          probe.lexed(this.valueAt, after, S_NAMES[this.state] ?? '');
        } else {
          // A one-line value holds the offset at its end too (typing there extends it).
          const value = state === S.acc_title || state === S.acc_descr ? 1 : 0;
          probe.lexed(before, after + value, S_NAMES[state] ?? '');
        }
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    }
    // At the end jison tries the rules once more on the empty input.
    this.emit(this.endKind(), this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The token a rule matching the empty input at the end gives in the current state. */
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

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The end of the one character v12 saw at `q`: a CRLF in the source is one LF to v12. A CR and
   * an LF that a removed span left side by side are two: v12 turned CRs into LFs first.
   */
  private charEnd(q: number): number {
    if (this.raw.charCodeAt(q) !== CR || this.raw.charCodeAt(q + 1) !== LF) return q + 1;
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1 ? q + 2 : q + 1;
  }

  /** The end of one `\s` at `q`, or -1. */
  private space(q: number): number {
    return isSpace(this.text.charCodeAt(q)) ? this.charEnd(q) : -1;
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

  private initial(c: number): void {
    const { text, p } = this;
    // `%(?!\{)[^\n]*` and `[^\}]%%[^\n]*`: comments (the second may start with a line break).
    if (c === PERCENT && text.charCodeAt(p + 1) !== LBRACE) {
      this.emit(Kind.Comment, p, this.lineEnd(p));
      return;
    }
    const q = this.charEnd(p);
    if (c !== RBRACE && text.charCodeAt(q) === PERCENT && text.charCodeAt(q + 1) === PERCENT) {
      this.emit(Kind.Comment, p, this.lineEnd(q));
      return;
    }
    // `[\n]+` and `\s+`.
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      this.emit(Kind.Newline, p, e);
      return;
    }
    if (isSpace(c)) {
      this.p = this.spaces(p);
      return;
    }
    // `#[^\n]*`.
    if (c === HASH) {
      this.emit(Kind.Comment, p, this.lineEnd(p));
      return;
    }
    const l = lowerCode(c);
    if (l === LOWER_T && (this.header() || this.title())) return;
    if (l === LOWER_A && this.acc()) return;
    if (l === LOWER_S && this.section()) return;
    if (c === COLON) {
      if (!this.event()) this.emit(T.Invalid, p, p + 1);
      return;
    }
    // `[^#:\n]+` (the text starts with neither, and line terminators were taken by `\s+`).
    let e = p + 1;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === HASH || d === COLON || d === LF) break;
      e++;
    }
    this.emit(T.Period, p, e);
  }

  /** `timeline[ \t]+LR\b`, `timeline[ \t]+TD\b` and `timeline\b`. */
  private header(): boolean {
    const { text, p } = this;
    if (!this.literal('timeline', p)) return false;
    const e = p + 8;
    let j = e;
    while (text.charCodeAt(j) === SPACE || text.charCodeAt(j) === TAB) j++;
    if (
      j > e &&
      (this.literal('lr', j) || this.literal('td', j)) &&
      !isWord(text.charCodeAt(j + 2))
    ) {
      this.emit(lowerCode(text.charCodeAt(j)) === 0x6c ? T.TimelineLR : T.TimelineTD, p, j + 2);
      return true;
    }
    if (isWord(text.charCodeAt(e))) return false;
    this.emit(T.Timeline, p, e);
    return true;
  }

  /** `title\s[^\n]+`. */
  private title(): boolean {
    if (!this.literal('title', this.p)) return false;
    const after = this.space(this.p + 5);
    if (after === -1) return false;
    const e = this.lineEnd(after);
    if (e === after) return false;
    this.emit(T.Title, this.p, e);
    return true;
  }

  /** `section\s[^:\n]+`. */
  private section(): boolean {
    const { text, p } = this;
    if (!this.literal('section', p)) return false;
    const after = this.space(p + 7);
    if (after === -1) return false;
    let e = after;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === COLON || d === LF) break;
      e++;
    }
    if (e === after) return false;
    this.emit(T.Section, p, e);
    return true;
  }

  /** `:\s(?:[^:\n]|:(?!\s))+`. */
  private event(): boolean {
    const { text, p } = this;
    const after = this.space(p + 1);
    if (after === -1) return false;
    let e = after;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === LF || (d === COLON && isSpace(text.charCodeAt(e + 1)))) break;
      e++;
    }
    if (e === after) return false;
    this.emit(T.Event, p, e);
    return true;
  }

  /** `accTitle\s*:\s*`, `accDescr\s*:\s*` and `accDescr\s*\{\s*`. */
  private acc(): boolean {
    const { text, p } = this;
    const title = this.literal('acctitle', p);
    if (!title && !this.literal('accdescr', p)) return false;
    const j = this.spaces(p + 8);
    const d = text.charCodeAt(j);
    this.valueAt = this.source(j + 1);
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

  /** `(?!\n|;|#)*[^\n]*`: the lookahead is optional, so `[^\n]*` (title or one-line description). */
  private accValue(): void {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.popState();
    this.emit(kind, this.p, this.lineEnd(this.p));
  }

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
