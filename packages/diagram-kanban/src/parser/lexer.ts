/**
 * Kanban lexer: a state machine mirroring the start conditions and rule order of v12's
 * `kanban.jison` (parser-method §1), copied from the mindmap lexer (`kanban.jison` is a fork of
 * `mindmap.jison` with shape data added):
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}) and
 *   line breaks as v12 had them (CRLF and CR as LF), and maps each token back to its range in
 *   the source, which is never rewritten. A token that runs over a removed span is one token
 *   whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only) and `kanban` ends in `\b`; `\s*%%.*` comes first, so
 * it takes the blanks and line breaks before a `%%` that v12's comment removal left; a regex
 * `.` stops at LF, CR, U+2028 and U+2029, `[\n]` at LF only; `[\s]+[\n]` backtracks to the
 * last line break of a blank run; `<NODE>[^\)\]\(\}]+` and `<ICON>[^\)]+` span line breaks;
 * the rules that return no token (`:::`, `::icon(`, `)` after an icon, the quotes of a
 * string, a line break after a bare `:::`, the `}` closing shape data) are kinds of their own
 * with no jison name.
 *
 * Shape data: `@{` is tried first in INITIAL and returns a `SHAPE_DATA` whose image its action
 * cleared; inside, `[^}^"]+` (line breaks included) and each `"` are `SHAPE_DATA` tokens, and
 * a quoted run's text is one more. `Lexed.text` applies both actions' rewrites of the image.
 *
 * jison throws on a `{` or `}` outside a shape, an `@` that starts no `@{`, a `^` in shape
 * data, a lone backtick or quote in a markdown string and a U+2028 or U+2029 after `:::`; each
 * is a one-character `Kind.Error` and lexing goes on. Every scan is linear in the text it
 * consumes (R-PARSE-7).
 */
// cspell:words NSTR
import {
  AT,
  BACKTICK,
  CARET,
  COLON,
  cook,
  DASH,
  DQUOTE,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  lowerCode,
  LPAREN,
  PERCENT,
  RBRACE,
  RBRACKET,
  RPAREN,
  StateLexer,
} from '@mermaid-js/core/parser-kit';
import type {
  Probe,
  SourceView,
  StateLexerOptions,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of kanban.jison (its `shapeDataEndBracket` is declared and never entered).
const S = {
  INITIAL: 0,
  NODE: 1,
  NSTR: 2,
  NSTR2: 3,
  ICON: 4,
  CLASS: 5,
  SHAPE_DATA: 6,
  SHAPE_DATA_STR: 7,
} as const;

/** Start condition names by number, for the probe's lexer mode (R-LANG-7). */
const S_NAMES: readonly string[] = Object.entries(S)
  .sort((a, b) => a[1] - b[1])
  .map(([name]) => name);

/** What a regex `.` does not match, once CRs are LFs. */
const DOT_ENDS = ['\n', '\u2028', '\u2029'] as const;

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}), and the rewrites of `kanban.jison`'s actions. `@{` reads `''`. In a quoted
   * run of shape data each `\n\s*` reads `<br/>`; a run left open at the end of the text took
   * the line break v12 appended, so it reads one more. Read token text only through this.
   */
  text(j: number): string;
}

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 6, crlf: 'fold', dropSpace: true };

/**
 * Lex the kanban body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): Lexed {
  const lexer = new KanbanLexer(src, from, view, OPTIONS);
  const tokens = lexer.run(probe);
  const open = lexer.openRun;
  return {
    tokens,
    text(j) {
      const kind = tokens.kind[j];
      if (kind === T.ShapeDataStart) return '';
      const start = tokens.start[j] ?? 0;
      const text = cook(src, start, tokens.end[j] ?? 0, view);
      if (kind !== T.ShapeDataStr) return text;
      // `<shapeDataStr>[^\"]+`'s action.
      return (start === open ? text + '\n' : text).replace(/\n\s*/g, '<br/>');
    },
  };
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class KanbanLexer extends StateLexer {
  /** The next line end a regex `.` stops at, cached for {@link dotEnd} (-2: not looked up). */
  private readonly nextEnd = [-2, -2, -2];
  /** The source start of a quoted run of shape data that ran to the end of the text, or -1. */
  openRun = -1;

  run(probe?: Probe): TokenStream {
    this.trim();
    this.loop(probe, S_NAMES);
    // At the end jison tries the rules once more on the empty input: only INITIAL's `<<EOF>>`
    // matches it; in any other state jison ends with `$end` alone.
    if (this.state === S.INITIAL) this.emit(T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
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

  /** The two characters at `q` are `a` then `b`. */
  private pair(q: number, a: number, b: number): boolean {
    return this.text.charCodeAt(q) === a && this.text.charCodeAt(q + 1) === b;
  }

  // --- States -------------------------------------------------------------------------------

  protected step(c: number): void {
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
      case S.CLASS:
        this.classState(c);
        return;
      case S.SHAPE_DATA:
        this.shapeData(c);
        return;
      default:
        this.shapeDataStr(c);
    }
  }

  private initial(c: number): void {
    const { text, p } = this;
    // `\@\{`, tried before every other rule.
    if (c === AT && text.charCodeAt(p + 1) === LBRACE) {
      this.begin(T.ShapeDataStart, p + 2, S.SHAPE_DATA);
      return;
    }
    // `\s*\%\%.*`.
    const b = isSpace(c) ? this.spaces(p) : p;
    if (this.pair(b, PERCENT, PERCENT)) {
      this.emit(T.SpaceLine, p, this.dotEnd(b + 2));
      return;
    }
    // `kanban` (`\b` after it).
    if (lowerCode(c) === 0x6b && this.literal('kanban', p) && !isWord(text.charCodeAt(p + 6))) {
      this.emit(T.Kanban, p, p + 6);
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
    // `[^\(\[\n\)\{\}@]+`.
    let e = p;
    while (e < this.n && !isIdStop(text.charCodeAt(e))) e++;
    if (e > p) this.emit(T.NodeId, p, e);
    // A `{` that starts no `{{`, a `}`, or an `@` that starts no `@{`: no rule matches, jison
    // throws.
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

  /**
   * `"` opens a quoted run; `[^}^"]+` is the data, line breaks included; `}` closes; a `^`
   * matches no rule.
   */
  private shapeData(c: number): void {
    const { text, p } = this;
    if (c === DQUOTE) {
      this.begin(T.ShapeDataQuote, p + 1, S.SHAPE_DATA_STR);
      return;
    }
    if (c === RBRACE) {
      this.pop(T.ShapeDataEnd, p + 1);
      return;
    }
    if (c === CARET) {
      this.emit(Kind.Error, p, p + 1);
      return;
    }
    let e = p + 1;
    while (e < this.n && !isDataStop(text.charCodeAt(e))) e++;
    this.emit(T.ShapeData, p, e);
  }

  /** `"` closes the quoted run; `[^"]+` is its text, line breaks included. */
  private shapeDataStr(c: number): void {
    if (c === DQUOTE) {
      this.pop(T.ShapeDataQuote, this.p + 1);
      return;
    }
    const e = this.text.indexOf('"', this.p);
    if (e === -1) this.openRun = this.source(this.p);
    this.emit(T.ShapeDataStr, this.p, e === -1 ? this.n : e);
  }

  /** `.+` is the class, to the line end; a line break right away ends it with no class. */
  private classState(c: number): void {
    if (!isLineEnd(c)) this.pop(T.Class, this.dotEnd(this.p));
    else if (c === LF) this.pop(T.ClassEnd, this.p + 1);
    // U+2028 and U+2029: neither `.` nor `\n` matches them.
    else this.emit(Kind.Error, this.p, this.p + 1);
  }
}

/** The characters `[^\(\[\n\)\{\}@]` (an item id) stops at. */
const isIdStop = (c: number) =>
  c === LPAREN ||
  c === LBRACKET ||
  c === LF ||
  c === RPAREN ||
  c === LBRACE ||
  c === RBRACE ||
  c === AT;

/** The characters `[^}^"]` (shape data outside quotes) stops at. */
const isDataStop = (c: number) => c === RBRACE || c === CARET || c === DQUOTE;

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
