/**
 * Gantt lexer: a state machine mirroring the start conditions and rule order of v12's
 * `gantt.jison` (parser-method §1), modelled on the timeline lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `%…` and `x%…` comments jison's rules skipped, and a dropped `;` no token took
 *   (`Space`).
 *
 * jison facts it reproduces:
 * - the first rule in order wins (no longest match), so keyword prefixes beat task text
 *   (`gantt plan :1d`, `weekend friday party :1d`), `click `, `call ` and `href "` at a token
 *   start enter their start conditions, and an ISO date at a token start is a `date` token;
 * - the lexer is case-insensitive (ASCII letters only), and keywords ending in a word
 *   character end in `\b` (ASCII word characters, as in JS);
 * - `[^\}]\%\%*[^\n]*` needs one `%` after any character but `}`, a line break included: a
 *   line whose first token is one character and a `%` vanishes (`5% buffer :3d`);
 * - `\%\%*[^\n]*[\n]*`: a `%` at a token start takes the rest of the line and the line breaks
 *   after it; `\%\%(?!\{)*[^\n]*` (the lookahead is optional) takes `%%` to the line end;
 * - `\n` in a rule is LF only, while `\s` takes every line terminator, so a bare `title`,
 *   `section` or `dateFormat` takes the next line, and `\s+` takes the line breaks after
 *   blanks (no `NL` token);
 * - `%%{` at a token start begins a start condition the grammar never declares: jison throws
 *   on the next token. Every other character is taken by some rule, so that is the only
 *   lexical error.
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words acctitle accdescr accdescription dateformat inclusiveenddates topaxis
// cspell:words axisformat tickinterval todaymarker
import {
  COLON,
  CR,
  DASH,
  DQUOTE,
  HASH,
  isSpace,
  Kind,
  LBRACE,
  LF,
  LOWER_A,
  LOWER_C,
  LOWER_G,
  LOWER_H,
  LOWER_S,
  LPAREN,
  PERCENT,
  RBRACE,
  RPAREN,
  SEMI,
} from '@mermaid-js/core/parser-kit';
import { tagQuotes } from '@mermaid-js/shared/parser/drop';
import { lexerText, lowerCode, StateLexer } from '@mermaid-js/shared/parser/state';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { StateLexerOptions } from '@mermaid-js/shared/parser/state';
import { T } from './tokens.ts';

// Start conditions of gantt.jison.
const S = {
  INITIAL: 0,
  acc_title: 1,
  acc_descr: 2,
  acc_descr_multiline: 3,
  click: 4,
  href: 5,
  callbackname: 6,
  callbackargs: 7,
} as const;

/** Start condition names by number, for the probe's lexer mode (R-LANG-7). */
const S_NAMES = [
  'INITIAL',
  'acc_title',
  'acc_descr',
  'acc_descr_multiline',
  'click',
  'href',
  'callbackname',
  'callbackargs',
];

/** A JS regex word character (`\w`, ASCII only): what jison's appended `\b` tests. */
const isAsciiWord = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

const isDigit = (c: number) => c >= 48 && c <= 57;

const LOWER_T = 0x74;
const LOWER_W = 0x77;

/**
 * The statement keywords whose value is `\s[^#\n;]+` (`todayMarker` allows `#`), in rule
 * order; `inclusiveEndDates` and `topAxis` (`\b`) sit between them.
 */
const VALUE_KEYWORDS: readonly (readonly [word: string, kind: number, hash: boolean])[] = [
  ['dateformat', T.DateFormat, false],
  ['inclusiveenddates', T.InclusiveEndDates, false],
  ['topaxis', T.TopAxis, false],
  ['axisformat', T.AxisFormat, false],
  ['tickinterval', T.TickInterval, false],
  ['includes', T.Includes, false],
  ['excludes', T.Excludes, false],
  ['todaymarker', T.TodayMarker, true],
];
/** Keywords tested with `\b` instead of a value. */
const BARE = new Set<number>([T.InclusiveEndDates, T.TopAxis]);

/** {@link VALUE_KEYWORDS} by first letter (lower case), each list in rule order. */
const VALUE_KEYWORDS_BY_LETTER = /* @__PURE__ */ (() => {
  const out = new Map<number, (typeof VALUE_KEYWORDS)[number][]>();
  for (const entry of VALUE_KEYWORDS) {
    const c = entry[0].charCodeAt(0);
    const list = out.get(c);
    if (list) list.push(entry);
    else out.set(c, [entry]);
  }
  return out;
})();

const WEEKDAYS: readonly (readonly [day: string, kind: number])[] = [
  ['monday', T.WeekdayMonday],
  ['tuesday', T.WeekdayTuesday],
  ['wednesday', T.WeekdayWednesday],
  ['thursday', T.WeekdayThursday],
  ['friday', T.WeekdayFriday],
  ['saturday', T.WeekdaySaturday],
  ['sunday', T.WeekdaySunday],
];
const WEEKENDS: readonly (readonly [day: string, kind: number])[] = [
  ['friday', T.WeekendFriday],
  ['saturday', T.WeekendSaturday],
];

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 8, crlf: 'keep', dropSpace: true };

/**
 * Lex the gantt body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new GanttLexer(src, from, view, OPTIONS).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class GanttLexer extends StateLexer {
  /**
   * The text the lexer reads, of the same length as the view's text: v12 turned every CRLF and
   * CR into LF before lexing, so a CRLF reads as two LFs (every rule treats a run of line breaks
   * as one, except a single `\s`, `[\s\n]` or `[^\}]`, which the lexer steps over as a pair) and
   * a lone CR as LF; each `#name;` entity is `ﬂ`, the name and `¶`, so no rule takes its `#`
   * (v12's placeholders); a `"` v12 turned into `'` (an HTML attribute quote) is `'`.
   */
  protected override prepare(text: string, view: SourceView): string {
    // The quotes first: neither replacement after it changes the length or touches a `"`.
    return lexerText(tagQuotes(view));
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
        this.step(text.charCodeAt(this.p));
        const after = this.source(this.p);
        // A value holds the offset at its end too (typing extends it): a step that stays in its
        // start condition, or the one-line value of `accTitle:`/`accDescr:`. A closer that leaves
        // one (`click`'s blank, `"`, `)`, `}`) does not.
        const stays = this.state === state || state === S.acc_title || state === S.acc_descr;
        const value = state !== S.INITIAL && stays ? 1 : 0;
        probe.lexed(before, Math.min(after + value, this.src.length), S_NAMES[state] ?? '');
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
      case S.click:
        return T.ClickId;
      case S.href:
        return T.Href;
      case S.callbackname:
        return T.CallbackName;
      case S.callbackargs:
        return T.CallbackArgs;
      default:
        return T.Eof;
    }
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The first `c` at or after `q` (`[^c]*` ends there), else the end. */
  private until(c: string, q: number): number {
    const e = this.text.indexOf(c, q);
    return e === -1 ? this.n : e;
  }

  /** The end of the run of `[^#\n;]` (`[^\n;]` with `hash`) from `q`. */
  private values(q: number, hash: boolean): number {
    let j = q;
    for (; j < this.n; j++) {
      const c = this.text.charCodeAt(j);
      if (c === LF || c === SEMI || (c === HASH && !hash)) break;
    }
    return j;
  }

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

  /** Whether `word` is at `q`, followed by jison's `\b` (no word character after it). */
  private keyword(word: string, q: number): boolean {
    return this.literal(word, q) && !isAsciiWord(this.text.charCodeAt(q + word.length));
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
      case S.acc_descr_multiline:
        this.accDescrMultiline(c);
        return;
      case S.click:
        this.click(c);
        return;
      case S.href:
        this.href(c);
        return;
      case S.callbackname:
        this.callbackName(c);
        return;
      default:
        this.callbackArgs(c);
    }
  }

  /** INITIAL: the rules in `gantt.jison`'s order, split where the skipped ones end. */
  private initial(c: number): void {
    if (this.skipped(c)) return;
    if (this.keywords(c, lowerCode(c))) return;
    const { text, p } = this;
    if (c === COLON) {
      // `:[^#\n;]+` and `:`.
      const e = this.values(p + 1, false);
      this.emit(e > p + 1 ? T.TaskData : T.Colon, p, e > p + 1 ? e : p + 1);
      return;
    }
    // `[^:\n]+` (it starts with neither: `:` and line breaks were taken above).
    let e = p + 1;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === COLON || d === LF) break;
      e++;
    }
    this.emit(T.TaskText, p, e);
  }

  /**
   * The rules up to `\s+`: `%%{`, the accessibility openers, the three comment rules, `[\n]+`
   * and `\s+`. True when one matched.
   */
  private skipped(c: number): boolean {
    const { text, p } = this;
    // `%%\{`: a start condition jison never declares; the next token throws.
    if (c === PERCENT && text.charCodeAt(p + 1) === PERCENT && text.charCodeAt(p + 2) === LBRACE) {
      this.emit(T.OpenDirective, p, p + 3);
      this.emit(Kind.Error, p + 3, this.lineEnd(p + 3));
      return true;
    }
    if (lowerCode(c) === LOWER_A && this.acc()) return true;
    // `%%(?!\{)*[^\n]*`, `[^\}]%%*[^\n]*` and `%%*[^\n]*[\n]*` (the last also takes the line
    // breaks after the line).
    if (c === PERCENT) {
      let e = this.lineEnd(p);
      if (text.charCodeAt(p + 1) !== PERCENT) while (text.charCodeAt(e) === LF) e++;
      this.emit(Kind.Comment, p, e);
      return true;
    }
    const q = this.charEnd(p);
    if (c !== RBRACE && text.charCodeAt(q) === PERCENT) {
      this.emit(Kind.Comment, p, this.lineEnd(q));
      return true;
    }
    // `[\n]+` and `\s+`.
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      this.emit(Kind.Newline, p, e);
      return true;
    }
    if (!isSpace(c)) return false;
    this.p = this.spaces(p);
    return true;
  }

  /** The keyword rules, `href[\s]+["]` to `section\s[^\n]+`. `l` is `c` in lower case. */
  private keywords(c: number, l: number): boolean {
    const { p } = this;
    if (l === LOWER_H) return this.hrefKeyword();
    if (l === LOWER_C) {
      return (
        this.opener('call', T.CallKeyword, S.callbackname) ||
        this.opener('click', T.ClickKeyword, S.click)
      );
    }
    if (l === LOWER_G && this.keyword('gantt', p)) {
      this.emit(T.Gantt, p, p + 5);
      return true;
    }
    if (this.valueKeyword(l)) return true;
    if (l === LOWER_W) return this.week();
    if (isDigit(c)) return this.date();
    if (l === LOWER_T) return this.line('title', T.Title);
    if (l === LOWER_A) return this.accDescription();
    if (l === LOWER_S) return this.line('section', T.Section);
    return false;
  }

  /** `href[\s]+["]`. */
  private hrefKeyword(): boolean {
    const { p } = this;
    if (!this.literal('href', p)) return false;
    const j = this.spaces(p + 4);
    if (j === p + 4 || this.text.charCodeAt(j) !== DQUOTE) return false;
    this.emit(T.HrefKeyword, p, j + 1);
    this.pushState(S.href);
    return true;
  }

  /** `call[\s]+` and `click[\s]+`: the keyword and its blanks, one token. */
  private opener(word: string, kind: number, state: number): boolean {
    const { p } = this;
    if (!this.literal(word, p)) return false;
    const j = this.spaces(p + word.length);
    if (j === p + word.length) return false;
    this.emit(kind, p, j);
    this.pushState(state);
    return true;
  }

  /**
   * `dateFormat\s[^#\n;]+`, `inclusiveEndDates\b`, `topAxis\b`, `axisFormat…`, `tickInterval…`,
   * `includes…`, `excludes…` and `todayMarker\s[^\n;]+`, in rule order. Only the keywords
   * starting with `l` (the token's first letter, lower case) are tried.
   */
  private valueKeyword(l: number): boolean {
    const { p } = this;
    const list = VALUE_KEYWORDS_BY_LETTER.get(l);
    if (!list) return false;
    for (const [word, kind, hash] of list) {
      if (BARE.has(kind)) {
        if (!this.keyword(word, p)) continue;
        this.emit(kind, p, p + word.length);
        return true;
      }
      if (!this.literal(word, p)) continue;
      const after = this.space(p + word.length);
      if (after === -1) continue;
      const e = this.values(after, hash);
      if (e === after) continue;
      this.emit(kind, p, e);
      return true;
    }
    return false;
  }

  /** `weekday\s+<day>\b` and `weekend\s+(friday|saturday)\b`. */
  private week(): boolean {
    const { p } = this;
    const weekday = this.literal('weekday', p);
    if (!weekday && !this.literal('weekend', p)) return false;
    const j = this.spaces(p + 7);
    if (j === p + 7) return false;
    for (const [day, kind] of weekday ? WEEKDAYS : WEEKENDS) {
      if (!this.keyword(day, j)) continue;
      this.emit(kind, p, j + day.length);
      return true;
    }
    return false;
  }

  /** `\d\d\d\d-\d\d-\d\d\b`. */
  private date(): boolean {
    const { text, p } = this;
    for (let k = 0; k < 10; k++) {
      const c = text.charCodeAt(p + k);
      if (k === 4 || k === 7 ? c !== DASH : !isDigit(c)) return false;
    }
    if (isAsciiWord(text.charCodeAt(p + 10))) return false;
    this.emit(T.Date, p, p + 10);
    return true;
  }

  /** `title\s[^\n]+` and `section\s[^\n]+`. */
  private line(word: string, kind: number): boolean {
    if (!this.literal(word, this.p)) return false;
    const after = this.space(this.p + word.length);
    if (after === -1) return false;
    const e = this.lineEnd(after);
    if (e === after) return false;
    this.emit(kind, this.p, e);
    return true;
  }

  /** `accDescription\s[^#\n;]+`. */
  private accDescription(): boolean {
    const { p } = this;
    if (!this.literal('accdescription', p)) return false;
    const after = this.space(p + 14);
    if (after === -1) return false;
    const e = this.values(after, false);
    if (e === after) return false;
    this.emit(T.AccDescription, p, e);
    return true;
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

  /** `(?!\n|;|#)*[^\n]*`: the lookahead is optional, so `[^\n]*` (title or one-line description). */
  private accValue(): void {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.popState();
    this.emit(kind, this.p, this.lineEnd(this.p));
  }

  /** `[\}]` and `[^\}]*`. */
  private accDescrMultiline(c: number): void {
    const { p } = this;
    if (c === RBRACE) {
      this.popState();
      this.emit(T.AccDescrMultilineEnd, p, p + 1);
      return;
    }
    this.emit(T.AccDescrMultilineValue, p, this.until('}', p));
  }

  /** `[\s\n]` (one character) and `[^\s\n]*`. */
  private click(c: number): void {
    const { p } = this;
    if (isSpace(c)) {
      this.popState();
      this.emit(T.ClickEnd, p, this.charEnd(p));
      return;
    }
    let e = p + 1;
    while (e < this.n && !isSpace(this.text.charCodeAt(e))) e++;
    this.emit(T.ClickId, p, e);
  }

  /** `["]` and `[^"]*`. */
  private href(c: number): void {
    const { p } = this;
    if (c === DQUOTE) {
      this.popState();
      this.emit(T.HrefEnd, p, p + 1);
      return;
    }
    this.emit(T.Href, p, this.until('"', p));
  }

  /** `\([\s]*\)`, `\(` and `[^(]*`. */
  private callbackName(c: number): void {
    const { p } = this;
    if (c === LPAREN) {
      const j = this.spaces(p + 1);
      this.popState();
      if (this.text.charCodeAt(j) === RPAREN) {
        this.emit(T.CallbackEmptyArgs, p, j + 1);
        return;
      }
      this.pushState(S.callbackargs);
      this.emit(T.CallbackArgsOpen, p, p + 1);
      return;
    }
    this.emit(T.CallbackName, p, this.until('(', p));
  }

  /** `\)` and `[^)]*`. */
  private callbackArgs(c: number): void {
    const { p } = this;
    if (c === RPAREN) {
      this.popState();
      this.emit(T.CallbackArgsClose, p, p + 1);
      return;
    }
    this.emit(T.CallbackArgs, p, this.until(')', p));
  }
}
