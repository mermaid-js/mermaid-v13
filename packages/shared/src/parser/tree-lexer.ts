/**
 * The lexer of the indentation-tree diagrams (mindmap, kanban): a state machine mirroring the
 * start conditions and rule order of v12's `mindmap.jison`, which `kanban.jison` forks (it adds
 * `@{ … }` shape data), modelled on the timeline lexer (parser-method §1):
 * - it lexes the text v12 lexed, with comments and directives cut out (`sourceView`) and line
 *   breaks as v12 had them (CRLF and CR as LF), and maps each token back to its range in the
 *   source, which is never rewritten. A token that runs over a removed span is one token whose
 *   range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only) and the diagram's keyword ends in `\b`; `\s*%%.*` comes
 * first, so it takes the blanks and line breaks before a `%%` that v12's comment removal left;
 * a regex `.` stops at LF, CR, U+2028 and U+2029, `[\n]` at LF only; `[\s]+[\n]` backtracks to
 * the last line break of a blank run; `<NODE>[^\)\]\(\}]+` and `<ICON>[^\)]+` span line breaks;
 * the rules that return no token (`:::`, `::icon(`, `)` after an icon, the quotes of a string,
 * a line break after a bare `:::`, the `}` closing shape data) are kinds of their own with no
 * jison name.
 *
 * Shape data (a diagram whose {@link TreeKindTable} names its kinds): `@{` is tried first in INITIAL
 * and returns a `SHAPE_DATA` whose image its action cleared; inside, `[^}^"]+` (line breaks
 * included) and each `"` are `SHAPE_DATA` tokens, and a quoted run's text is one more.
 *
 * jison throws on a `{` or `}` outside a shape, a lone backtick or quote in a markdown string
 * and a U+2028 or U+2029 after `:::`, and with shape data on an `@` that starts no `@{` and a
 * `^` in the data; each is a one-character `Kind.Error` and lexing goes on. Every scan is
 * linear in the text it consumes (R-PARSE-7).
 */
// cspell:words NSTR
import {
  AT,
  BACKTICK,
  CARET,
  COLON,
  DASH,
  DQUOTE,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  LPAREN,
  PERCENT,
  type Probe,
  RBRACE,
  RBRACKET,
  RPAREN,
  type SourceView,
  type TokenStream,
} from '@mermaid-js/core/parser-kit';
import { lowerCode, StateLexer, type StateLexerOptions } from './state-lexer.ts';

/**
 * The token kinds of one indentation-tree diagram, as its own table names them: the terminals
 * of its jison lexer, and a kind for each text jison matches without returning a token. A
 * diagram's `T` table has them under these names, but for its keyword.
 */
export interface TreeKindTable {
  /** The diagram's keyword (case-insensitive, word-bounded). */
  readonly Keyword: number;
  readonly SpaceLine: number;
  readonly SpaceList: number;
  readonly NodeId: number;
  readonly NodeDStart: number;
  readonly NodeDescr: number;
  readonly NodeDEnd: number;
  readonly IconStart: number;
  readonly Icon: number;
  readonly IconEnd: number;
  readonly ClassStart: number;
  readonly Class: number;
  readonly ClassEnd: number;
  readonly StringStart: number;
  readonly StringEnd: number;
  readonly MdStringStart: number;
  readonly MdStringEnd: number;
  readonly Eof: number;
  /** `@{`: with it the diagram has shape data, and names the four kinds below too. */
  readonly ShapeDataStart?: number;
  readonly ShapeData?: number;
  readonly ShapeDataQuote?: number;
  readonly ShapeDataStr?: number;
  readonly ShapeDataEnd?: number;
}

/** A {@link TreeKindTable} with every kind a number (-1, which no token has, for one left out). */
export type TreeKinds = { readonly [K in keyof TreeKindTable]-?: number } & {
  /** The diagram has `@{ … }` shape data. */
  readonly data: boolean;
};

/**
 * The {@link TreeKinds} of a diagram's table (built once per diagram): the kinds left out are
 * -1. Always the same fields in the same order, whatever else the table holds, so the code
 * reading them sees one object shape.
 */
export function treeKinds(kinds: TreeKindTable): TreeKinds {
  return {
    Keyword: kinds.Keyword,
    SpaceLine: kinds.SpaceLine,
    SpaceList: kinds.SpaceList,
    NodeId: kinds.NodeId,
    NodeDStart: kinds.NodeDStart,
    NodeDescr: kinds.NodeDescr,
    NodeDEnd: kinds.NodeDEnd,
    IconStart: kinds.IconStart,
    Icon: kinds.Icon,
    IconEnd: kinds.IconEnd,
    ClassStart: kinds.ClassStart,
    Class: kinds.Class,
    ClassEnd: kinds.ClassEnd,
    StringStart: kinds.StringStart,
    StringEnd: kinds.StringEnd,
    MdStringStart: kinds.MdStringStart,
    MdStringEnd: kinds.MdStringEnd,
    Eof: kinds.Eof,
    ShapeDataStart: kinds.ShapeDataStart ?? -1,
    ShapeData: kinds.ShapeData ?? -1,
    ShapeDataQuote: kinds.ShapeDataQuote ?? -1,
    ShapeDataStr: kinds.ShapeDataStr ?? -1,
    ShapeDataEnd: kinds.ShapeDataEnd ?? -1,
    data: kinds.ShapeDataStart !== undefined,
  };
}

// Start conditions of mindmap.jison, then those kanban.jison adds (its `shapeDataEndBracket`
// is declared and never entered).
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
const S_NAMES: readonly string[] = /* @__PURE__ */ Object.keys(S);

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 6, crlf: 'fold', dropSpace: true } as const;

/** A lex of an indentation-tree diagram. */
export interface TreeLex {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /** The source start of a quoted run of shape data that ran to the end of the text, or -1. */
  readonly openRun: number;
}

/**
 * Lex the body `src[from…]` of the diagram that starts with `keyword` (lower case). `view`
 * comes from `sourceView`. With a `probe`, the start condition at the probe's offset is
 * recorded as its mode.
 */
export function lexTree(
  src: string,
  from: number,
  view: SourceView,
  kinds: TreeKinds,
  keyword: string,
  probe?: Probe
): TreeLex {
  const lexer = new TreeLexer(src, from, view, kinds, keyword);
  return { tokens: lexer.run(probe), openRun: lexer.openRun };
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it. Not subclassed: a diagram's differences are
 * its kinds and keyword.
 */
class TreeLexer extends StateLexer {
  /** The source start of a quoted run of shape data that ran to the end of the text, or -1. */
  openRun = -1;
  /** The first character of the diagram's keyword. */
  private readonly wordStart: number;

  constructor(
    src: string,
    from: number,
    view: SourceView,
    private readonly k: TreeKinds,
    /** The diagram's keyword, lower case. */
    private readonly word: string
  ) {
    super(src, from, view, OPTIONS);
    this.wordStart = word.charCodeAt(0);
  }

  run(probe?: Probe): TokenStream {
    this.trim();
    this.loop(probe, S_NAMES);
    // At the end jison tries the rules once more on the empty input: only INITIAL's `<<EOF>>`
    // matches it; in any other state jison ends with `$end` alone.
    if (this.state === S.INITIAL) this.emit(this.k.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  // --- Scans --------------------------------------------------------------------------------

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
    const { text, p, k } = this;
    // `\@\{`, tried before every other rule.
    if (k.data && c === AT && text.charCodeAt(p + 1) === LBRACE) {
      this.begin(k.ShapeDataStart, p + 2, S.SHAPE_DATA);
      return;
    }
    // `\s*\%\%.*`.
    const b = isSpace(c) ? this.spaces(p) : p;
    if (this.pair(b, PERCENT, PERCENT)) {
      this.emit(k.SpaceLine, p, this.dotEnd(b + 2));
      return;
    }
    if (lowerCode(c) === this.wordStart && this.keyword()) return;
    if (c === COLON && this.colons()) return;
    // No shape opener is a blank, so the blank rules below the openers apply here too.
    if (isSpace(c)) {
      this.blankRun(c, b);
      return;
    }
    const open = opener(c, text.charCodeAt(p + 1));
    if (open > 0) {
      this.begin(k.NodeDStart, p + open, S.NODE);
      return;
    }
    const e = this.idEnd(p);
    if (e > p) this.emit(k.NodeId, p, e);
    // A `{` that starts no `{{`, a `}`, or (with shape data) an `@` that starts no `@{`: no
    // rule matches, jison throws.
    else this.emit(Kind.Error, p, p + 1);
  }

  /** The keyword at the cursor (`\b` after it): whether it was there, and so lexed. */
  private keyword(): boolean {
    const { p } = this;
    const e = p + this.word.length;
    if (!this.literal(this.word, p) || isWord(this.text.charCodeAt(e))) return false;
    this.emit(this.k.Keyword, p, e);
    return true;
  }

  /** `:::` or `::icon(` at the cursor: whether one was there, and so lexed. */
  private colons(): boolean {
    const { p } = this;
    if (this.pair(p + 1, COLON, COLON)) {
      this.begin(this.k.ClassStart, p + 3, S.CLASS);
      return true;
    }
    if (this.literal('::icon(', p)) {
      this.begin(this.k.IconStart, p + 7, S.ICON);
      return true;
    }
    return false;
  }

  /** The blank run from the cursor (its first character `c`) to `b`, which no comment follows. */
  private blankRun(c: number, b: number): void {
    const { text, p } = this;
    // `[\s]+[\n]`: back from the end of the blank run to its last LF (not the first blank).
    let l = b - 1;
    while (l > p && text.charCodeAt(l) !== LF) l--;
    if (l > p) {
      this.emit(this.k.SpaceLine, p, l + 1);
      return;
    }
    // `[\n]+`.
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      this.emit(Kind.Newline, p, e);
      return;
    }
    // `[\s]+` (no LF in the run, or a rule above took it).
    this.emit(this.k.SpaceList, p, b);
  }

  /** The end of `[^\(\[\n\)\{\}]+` at `p`, or with shape data of `[^\(\[\n\)\{\}@]+`. */
  private idEnd(p: number): number {
    const { text, n } = this;
    let e = p;
    if (this.k.data) while (e < n && !isDataIdStop(text.charCodeAt(e))) e++;
    else while (e < n && !isIdStop(text.charCodeAt(e))) e++;
    return e;
  }

  private node(c: number): void {
    const { text, p } = this;
    const d = text.charCodeAt(p + 1);
    if (c === DQUOTE) {
      if (d === BACKTICK) this.begin(this.k.MdStringStart, p + 2, S.NSTR2);
      else this.begin(this.k.StringStart, p + 1, S.NSTR);
      return;
    }
    const close = closer(c, d);
    if (close > 0) {
      this.pop(this.k.NodeDEnd, p + close);
      return;
    }
    // `[^\)\]\(\}]+`, line breaks included.
    if (c !== RBRACE) {
      let e = p + 1;
      while (e < this.n && !isDescrStop(text.charCodeAt(e))) e++;
      this.emit(this.k.NodeDescr, p, e);
      return;
    }
    // `.+(?!\(\()` at a lone `}`: the rest of the line (the lookahead always holds at its end).
    this.emit(this.k.NodeDescr, p, this.dotEnd(p));
  }

  /** `"` closes; `[^"]+` is the text. */
  private nstr(c: number): void {
    if (c === DQUOTE) {
      this.pop(this.k.StringEnd, this.p + 1);
      return;
    }
    const e = this.text.indexOf('"', this.p);
    this.emit(this.k.NodeDescr, this.p, e === -1 ? this.n : e);
  }

  /** Not a backtick or quote: the text; a backtick then a quote closes; a lone one of them matches no rule. */
  private nstr2(c: number): void {
    const { text, p } = this;
    if (c !== BACKTICK && c !== DQUOTE) {
      let e = p + 1;
      while (e < this.n && text.charCodeAt(e) !== BACKTICK && text.charCodeAt(e) !== DQUOTE) e++;
      this.emit(this.k.NodeDescr, p, e);
      return;
    }
    if (this.pair(p, BACKTICK, DQUOTE)) this.pop(this.k.MdStringEnd, p + 2);
    else this.emit(Kind.Error, p, p + 1);
  }

  /** `)` closes; `[^\)]+` is the icon, line breaks included. */
  private icon(c: number): void {
    if (c === RPAREN) {
      this.pop(this.k.IconEnd, this.p + 1);
      return;
    }
    const e = this.text.indexOf(')', this.p);
    this.emit(this.k.Icon, this.p, e === -1 ? this.n : e);
  }

  /**
   * `"` opens a quoted run; `[^}^"]+` is the data, line breaks included; `}` closes; a `^`
   * matches no rule.
   */
  private shapeData(c: number): void {
    const { text, p } = this;
    if (c === DQUOTE) {
      this.begin(this.k.ShapeDataQuote, p + 1, S.SHAPE_DATA_STR);
      return;
    }
    if (c === RBRACE) {
      this.pop(this.k.ShapeDataEnd, p + 1);
      return;
    }
    if (c === CARET) {
      this.emit(Kind.Error, p, p + 1);
      return;
    }
    let e = p + 1;
    while (e < this.n && !isDataStop(text.charCodeAt(e))) e++;
    this.emit(this.k.ShapeData, p, e);
  }

  /** `"` closes the quoted run; `[^"]+` is its text, line breaks included. */
  private shapeDataStr(c: number): void {
    if (c === DQUOTE) {
      this.pop(this.k.ShapeDataQuote, this.p + 1);
      return;
    }
    const e = this.text.indexOf('"', this.p);
    if (e === -1) this.openRun = this.source(this.p);
    this.emit(this.k.ShapeDataStr, this.p, e === -1 ? this.n : e);
  }

  /** `.+` is the class, to the line end; a line break right away ends it with no class. */
  private classState(c: number): void {
    if (!isLineEnd(c)) this.pop(this.k.Class, this.dotEnd(this.p));
    else if (c === LF) this.pop(this.k.ClassEnd, this.p + 1);
    // U+2028 and U+2029: neither `.` nor `\n` matches them.
    else this.emit(Kind.Error, this.p, this.p + 1);
  }
}

/** The characters `[^\(\[\n\)\{\}]` (a node id) stops at. */
const isIdStop = (c: number) =>
  c === LPAREN || c === LBRACKET || c === LF || c === RPAREN || c === LBRACE || c === RBRACE;

/** The characters `[^\(\[\n\)\{\}@]` (a node id before shape data) stops at. */
const isDataIdStop = (c: number) => isIdStop(c) || c === AT;

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
