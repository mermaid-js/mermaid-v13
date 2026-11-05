/**
 * Flowchart lexer: a state machine mirroring the start conditions of v12's `flow.jison`
 * (DESIGN §4.3). Ported from Pele's `src/diagrams/flowchart/lexer.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), which is checked token by token
 * against the jison lexer. Changes from Pele:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order;
 * - CRLF and CR are line breaks; `}\s*\n` and v12's `encodeEntities` quirks are reproduced;
 * - an unmatched character is an `Error` token, and lexing carries on (for recovery).
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words kepano invis
import {
  AMP,
  ASCII_MAX,
  AT,
  BACKSLASH,
  BACKTICK,
  CARET,
  charTable,
  codePointEnd,
  COLON,
  COMMA,
  CR,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  GT,
  hasClass,
  HASH,
  isDigit,
  isLineEnd,
  isSpace,
  isUnicodeLetter,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  LOWER_A,
  LOWER_C,
  LOWER_D,
  LOWER_E,
  LOWER_F,
  LOWER_G,
  LOWER_H,
  LOWER_I,
  LOWER_L,
  LOWER_O,
  LOWER_S,
  LOWER_V,
  LOWER_X,
  LPAREN,
  LT,
  PIPE,
  QUESTION,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  STAR,
  TILDE,
  TokenWriter,
  UNDERSCORE,
  firstHole,
  localOffset,
  QUOTE,
  SourceOffsets,
  sourceView,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, Range, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/**
 * Flowchart's v12 source view (D114): the shared rewrites plus flowParser's `}\s*\n` → `}\n`.
 */
export function flowSourceView(
  src: string,
  from: number,
  directives: readonly Range[]
): SourceView {
  return sourceView(src, from, directives, { braceNewline: true });
}

// Start conditions of flow.jison (the ones the lexer needs).
const S = {
  INITIAL: 0,
  string: 1,
  md_string: 2,
  acc_title: 3,
  acc_descr: 4,
  acc_descr_multiline: 5,
  dir: 6,
  text: 7,
  ellipseText: 8,
  trapText: 9,
  edgeText: 10,
  thickEdgeText: 11,
  dottedEdgeText: 12,
  click: 13,
  callbackname: 14,
  callbackargs: 15,
  shapeData: 16,
  shapeDataStr: 17,
} as const;
/** Start condition names by number, for the probe's lexer mode. */
const S_NAMES = /* @__PURE__ */ Object.keys(S);

// jison's <<EOF>> in states whose value rule matches the empty string: the empty value token.
function eofValueKind(state: number): number {
  switch (state) {
    case S.acc_title:
      return T.AccTitleValue;
    case S.acc_descr:
      return T.AccDescrValue;
    case S.acc_descr_multiline:
      return T.AccDescrMultilineValue;
    case S.click:
      return T.Click;
    case S.callbackname:
      return T.CallbackName;
    case S.callbackargs:
      return T.CallbackArgs;
    default:
      return -1;
  }
}

// Character classes of flow.jison's lexer rules.
/** jison's NODE_STRING (`-` and `=` are handled separately). */
const NODE = 1;
/** Ends a run of `<text>`. */
const TEXT_STOP = 2;
/** Ends a run of `<ellipseText>`. */
const ELLIPSE_STOP = 4;
/** Ends a run of `<trapText>`. */
const TRAP_STOP = 8;
/** Ends a run of `<shapeData>`. */
const SHAPE_DATA_STOP = 16;
const CHARS = /* @__PURE__ */ charTable(
  [NODE, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"#$%&\'*+.`?\\_/'],
  [TEXT_STOP, '[](){}|'],
  [ELLIPSE_STOP, '()[]{}'],
  [TRAP_STOP, '\\[](){}/'],
  [SHAPE_DATA_STOP, '}^']
);

const RE_ACC_TITLE = /accTitle\s*:\s*/y;
const RE_ACC_DESCR = /accDescr\s*:\s*/y;
const RE_ACC_DESCR_ML = /accDescr\s*\{\s*/y;
const RE_CALL = /call\s+/y;
const RE_CLICK = /click\s+/y;
// jison appends `\b` to literal rules that end in a word character.
const RE_DIR = /\s*(?:LR|RL|TB|BT|TD|BR)\b/y;
const RE_DIR_SYM = /\s*[<>^]/y;
const RE_DIR_V = /\s*v\b/y;
const RE_DIRECTION = [
  /.*direction\s+TB[^\n\r]*/y,
  /.*direction\s+BT[^\n\r]*/y,
  /.*direction\s+RL[^\n\r]*/y,
  /.*direction\s+LR[^\n\r]*/y,
  /.*direction\s+TD[^\n\r]*/y,
];
const RE_LINK = /\s*[xo<]?--+[-xo>]\s*/y;
const RE_START_LINK = /\s*[xo<]?--\s*/y;
const RE_THICK_LINK = /\s*[xo<]?==+[=xo>]\s*/y;
const RE_THICK_START = /\s*[xo<]?==\s*/y;
const RE_DOTTED_LINK = /\s*[xo<]?-?\.+-[xo>]?\s*/y;
const RE_DOTTED_START = /\s*[xo<]?-\.\s*/y;
const RE_INVIS_LINK = /\s*~~~+\s*/y;
const RE_SPACE = /[^\S\n\r]+/y;
const RE_END = /end\s*/y;
const RE_EMPTY_CALL = /\(\s*\)/y;
const RE_ENTITY = /#\w+;/y;
const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'];

const isNl = (c: number) => c === LF || c === CR;

/**
 * Lex the flowchart body `src[from…]`. `view` comes from {@link sourceView}. With
 * `graphKeyword` false, a `graph` keyword no longer opens the direction state (used when
 * lexing restarts mid-document after an error). With a `probe`, the start condition at the
 * probe's offset is recorded as its mode.
 */
export function lex(
  src: string,
  from: number,
  view: SourceView,
  graphKeyword = true,
  probe?: Probe
): TokenStream {
  return new FlowLexer(src, from, view, graphKeyword).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class FlowLexer {
  /** The text v12 lexed, plus the line break v12 appended (clamped in the output). */
  private readonly text: string;
  /** Length of v12's text without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  private readonly offsets: SourceOffsets | undefined;
  private readonly mask: Uint8Array | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private p: number;
  private readonly from: number;
  private firstGraph: boolean;
  // Memos that keep the scans below linear.
  private dirNext: number;
  private atNext: number;
  private lineEndAt = -1;
  private dirFailed = 0;
  private runEnd = 0;
  private runAt = -1;
  private wsFrom = -1;
  private wsTo = -1;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView,
    graphKeyword: boolean
  ) {
    this.text = view.text + '\n';
    this.len = view.text.length;
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.mask = view.mask;
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.from = this.p = localOffset(view, from);
    this.firstGraph = graphKeyword;
    // About one token per four characters of flowchart text.
    this.w = new TokenWriter(((this.len - this.p) >> 2) + 8);
    this.dirNext = this.text.indexOf('direction', this.p);
    this.atNext = this.text.indexOf('@', this.p);
  }

  run(probe?: Probe): TokenStream {
    const { text } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    if (this.firstGraph) while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) this.steps();
    else this.probedSteps(probe);
    const kind = eofValueKind(this.state);
    if (kind !== -1) this.emit(kind, this.len, this.len);
    if (this.state === S.INITIAL) this.emit(T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  private steps(): void {
    const { text, n } = this;
    while (this.p < n) {
      const before = this.p;
      if (!this.step(text.charCodeAt(this.p)) || this.p === before) this.noMatch();
    }
  }

  /** {@link steps}, telling `probe` the start condition each step reads its text in. */
  private probedSteps(probe: Probe): void {
    const { text, n } = this;
    while (this.p < n) {
      const before = this.p;
      const mode = S_NAMES[this.state] ?? '';
      if (!this.step(text.charCodeAt(this.p)) || this.p === before) this.noMatch();
      probe.lexed(this.source(before), this.source(this.p), mode);
    }
    probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
  }

  /** No rule matches: one Error token over one code point, then resume in the initial state. */
  private noMatch(): void {
    this.emit(Kind.Error, this.p, Math.min(codePointEnd(this.text, this.p), this.n));
    this.stack.length = 0;
    this.state = S.INITIAL;
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  private source(i: number): number {
    if (i >= this.len) return this.src.length;
    return this.offsets ? this.offsets.source(i) : i;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind !== 'drop') {
        this.w.push(h.kind === 'comment' ? Kind.Comment : Kind.Directive, h.start, h.end);
      }
    }
  }

  /** Write the token `text[s, e)` with its source range, and move past it. */
  private emit(kind: number, s: number, e: number): void {
    const a = this.source(s);
    const last = Math.min(e, this.len);
    let b = last > s ? this.source(last - 1) + 1 : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    this.p = e;
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }

  private push(s: number): void {
    this.stack.push(this.state);
    this.state = s;
  }

  private pop(): void {
    this.state = this.stack.pop() ?? S.INITIAL;
  }

  // --- Character tests and scans ------------------------------------------------------------

  /** A `"` that v12 had not turned into `'`. */
  private isQuote(i: number): boolean {
    return this.text.charCodeAt(i) === DQUOTE && ((this.mask?.[this.source(i)] ?? 0) & QUOTE) === 0;
  }

  /** `ch` at or after `start`, else the end. */
  private find(ch: string, start: number): number {
    const e = this.text.indexOf(ch, start);
    return e === -1 ? this.n : e;
  }

  private nextQuote(from: number): number {
    let e = this.find('"', from);
    while (e < this.n && !this.isQuote(e)) e = this.find('"', e + 1);
    return e;
  }

  /** The last blank of the run at `q`. */
  private blankRunEnd(q: number): number {
    let j = q;
    while (j + 1 < this.n && isSpace(this.text.charCodeAt(j + 1))) j++;
    return j;
  }

  /** End of the sticky `re` matched at `q`, or -1. */
  private at(re: RegExp, q: number): number {
    re.lastIndex = q;
    return re.test(this.text) ? re.lastIndex : -1;
  }

  // jison `(\r?\n)*\s*\n`: a blank run up to its last line feed.
  private noDirEnd(q: number): number {
    let last = -1;
    for (let j = q; j < this.n && isSpace(this.text.charCodeAt(j)); j++) {
      const ch = this.text.charCodeAt(j);
      // A lone CR was a line feed to v12.
      if (ch === LF || (ch === CR && this.text.charCodeAt(j + 1) !== LF)) last = j;
    }
    return last < 0 ? -1 : last + 1;
  }

  // jison `(\r?\n)+` (a lone CR, which v12 turned into LF, counts too).
  private newlineEnd(q: number): number {
    let j = q;
    while (j < this.n && isNl(this.text.charCodeAt(j))) j++;
    return j > q ? j : -1;
  }

  private entityAt(q: number): boolean {
    return this.at(RE_ENTITY, q) >= 0;
  }

  private kw(word: string): boolean {
    return (
      this.text.startsWith(word, this.p) && !isWord(this.text.charCodeAt(this.p + word.length))
    );
  }

  /** First character after any run of whitespace starting at q. */
  private skipWs(q: number): number {
    if (q >= this.wsFrom && q <= this.wsTo) return this.wsTo;
    let j = q;
    if (isSpace(this.text.charCodeAt(q))) {
      while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
      this.wsFrom = q;
      this.wsTo = j;
    }
    return j;
  }

  /** The character a link pattern at q turns on: after blanks and one optional `x`, `o` or `<`. */
  private linkChar(q: number): number {
    const j = this.skipWs(q);
    const d = this.text.charCodeAt(j);
    return d === LOWER_X || d === LOWER_O || d === LT ? this.text.charCodeAt(j + 1) : d;
  }

  private invisAhead(q: number): boolean {
    return this.text.charCodeAt(this.skipWs(q)) === TILDE;
  }

  // --- Rules shared by several states -------------------------------------------------------

  private quote(): void {
    if (this.text.charCodeAt(this.p + 1) === BACKTICK) {
      this.push(S.md_string);
      this.p += 2;
    } else {
      this.push(S.string);
      this.p++;
    }
  }

  private invisLink(): boolean {
    if (!this.invisAhead(this.p)) return false;
    const e = this.at(RE_INVIS_LINK, this.p);
    if (e < 0) return false;
    this.emit(T.Link, this.p, e);
    return true;
  }

  /** The shape openers; `c` is `(`, `[`, `|` or `{`. */
  private opener(c: number): boolean {
    const d = this.text.charCodeAt(this.p + 1);
    if (c === LPAREN) {
      if (d === DASH) return this.open(S.ellipseText, T.EllipseStart, 2);
      if (d === LBRACKET) return this.open(S.text, T.StadiumStart, 2);
      if (d === LPAREN && this.text.charCodeAt(this.p + 2) === LPAREN) {
        return this.open(S.text, T.DoubleCircleStart, 3);
      }
      return this.open(S.text, T.PS, 1);
    }
    if (c === LBRACKET) {
      if (d === LBRACKET) return this.open(S.text, T.SubroutineStart, 2);
      if (d === LPAREN) return this.open(S.text, T.CylinderStart, 2);
      if (d === SLASH) return this.open(S.trapText, T.TrapStart, 2);
      if (d === BACKSLASH) return this.open(S.trapText, T.InvTrapStart, 2);
      return this.open(S.text, T.SQS, 1);
    }
    if (c === PIPE) return this.open(S.text, T.Pipe, 1);
    if (c === LBRACE) return this.open(S.text, T.DiamondStart, 1);
    return false;
  }

  private open(state: number, kind: number, length: number): true {
    this.push(state);
    return this.token(kind, length);
  }

  private graph(length: number): void {
    if (this.firstGraph) {
      this.firstGraph = false;
      this.push(S.dir);
    }
    this.emit(T.Graph, this.p, this.p + length);
  }

  private nodeString(): boolean {
    const p = this.p;
    let q = p;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      // v12 had turned `#name;` into an entity placeholder, which ends a node string.
      if (ch === HASH && this.entityAt(q)) break;
      if (hasClass(CHARS, ch, NODE)) {
        q++;
      } else if (ch === DASH && q + 1 < this.n) {
        const d = this.text.charCodeAt(q + 1);
        if (d === GT || d === DASH || d === DOT) break;
        q++;
      } else {
        break;
      }
    }
    if (q === p) return false;
    this.emit(T.NodeString, p, q);
    return true;
  }

  private link(c: number): boolean {
    const p = this.p;
    const d = this.linkChar(p);
    let e: number;
    if (d === DASH) {
      if ((e = this.at(RE_LINK, p)) >= 0) return this.linkToken(p, e);
      if ((e = this.at(RE_START_LINK, p)) >= 0) return this.startLink(S.edgeText, p, e);
      if ((e = this.at(RE_DOTTED_LINK, p)) >= 0) return this.linkToken(p, e);
      if ((e = this.at(RE_DOTTED_START, p)) >= 0) return this.startLink(S.dottedEdgeText, p, e);
    } else if (d === EQUALS) {
      if ((e = this.at(RE_THICK_LINK, p)) >= 0) return this.linkToken(p, e);
      if ((e = this.at(RE_THICK_START, p)) >= 0) return this.startLink(S.thickEdgeText, p, e);
    } else if (d === DOT && (e = this.at(RE_DOTTED_LINK, p)) >= 0) {
      return this.linkToken(p, e);
    }
    return c !== DASH && c !== EQUALS && c !== DOT && this.invisLink();
  }

  private linkToken(s: number, e: number): true {
    this.emit(T.Link, s, e);
    return true;
  }

  private startLink(state: number, s: number, e: number): true {
    this.push(state);
    this.emit(T.StartLink, s, e);
    return true;
  }

  // mermaid@12.2.0's LINK_ID is `[^\s\"]+\@(?=[^\{\"])`.
  private isRunBreak(ch: number, q: number): boolean {
    return (ch === DQUOTE && this.isQuote(q)) || isSpace(ch);
  }

  // --- States -------------------------------------------------------------------------------

  private step(c: number): boolean {
    switch (this.state) {
      case S.INITIAL:
        return this.initial(c);
      case S.string:
        return this.string(c);
      case S.md_string:
        return this.mdString(c);
      case S.acc_title:
      case S.acc_descr:
        return this.accValue();
      case S.acc_descr_multiline:
        return this.accDescrMultiline(c);
      case S.dir:
        return this.dir(c);
      case S.text:
        return this.textState(c);
      case S.ellipseText:
        return this.ellipseText(c);
      case S.trapText:
        return this.trapText(c);
      case S.edgeText:
        return this.edgeText(c, RE_LINK, DASH, -1);
      case S.thickEdgeText:
        return this.edgeText(c, RE_THICK_LINK, EQUALS, -1);
      case S.dottedEdgeText:
        return this.edgeText(c, RE_DOTTED_LINK, DOT, DASH);
      case S.click:
        return this.click(c);
      case S.callbackname:
        return this.callbackName(c);
      case S.callbackargs:
        return this.callbackArgs(c);
      case S.shapeData:
        return this.shapeData(c);
      case S.shapeDataStr:
        return this.shapeDataStr(c);
    }
    return false;
  }

  private initial(c: number): boolean {
    return (
      this.keyword(c) ||
      this.direction() ||
      this.linkId(c) ||
      this.punctuation(c) ||
      this.blanks(c) ||
      this.word(c)
    );
  }

  /** The keyword rules, picked by their first character. */
  private keyword(c: number): boolean {
    const p = this.p;
    let e: number;
    switch (c) {
      case LOWER_A:
        if (this.text.startsWith('acc', p)) {
          if ((e = this.at(RE_ACC_TITLE, p)) >= 0) {
            this.push(S.acc_title);
            this.emit(T.AccTitle, p, e);
            return true;
          }
          if ((e = this.at(RE_ACC_DESCR, p)) >= 0) {
            this.push(S.acc_descr);
            this.emit(T.AccDescr, p, e);
            return true;
          }
          if ((e = this.at(RE_ACC_DESCR_ML, p)) >= 0) {
            this.push(S.acc_descr_multiline);
            this.p = e;
            return true;
          }
        }
        return false;
      case AT:
        if (this.text.charCodeAt(p + 1) !== LBRACE) return false;
        this.push(S.shapeData);
        this.emit(T.ShapeData, p, p + 2);
        return true;
      case LOWER_C:
        if ((e = this.at(RE_CALL, p)) >= 0) {
          this.push(S.callbackname);
          this.p = e;
          return true;
        }
        if (this.kw('classDef')) return this.token(T.ClassDef, 8);
        if (this.kw('class')) return this.token(T.Class, 5);
        if ((e = this.at(RE_CLICK, p)) >= 0) {
          this.push(S.click);
          // The keyword alone; the blanks after it belong to no token, as in jison.
          this.emit(T.ClickKeyword, p, p + 5);
          this.p = e;
          return true;
        }
        return false;
      case DQUOTE:
        if (!this.isQuote(p)) return false;
        this.quote();
        return true;
      case LOWER_S:
        if (this.kw('style')) return this.token(T.Style, 5);
        if (this.kw('swimlane-beta')) return this.graphWord(13);
        if (this.kw('subgraph')) return this.token(T.Subgraph, 8);
        return false;
      case LOWER_D:
        return this.kw('default') && this.token(T.Default, 7);
      case LOWER_L:
        return this.kw('linkStyle') && this.token(T.LinkStyle, 9);
      case LOWER_I:
        return this.kw('interpolate') && this.token(T.Interpolate, 11);
      case LOWER_H:
        if (!this.text.startsWith('href', p) || !isSpace(this.text.charCodeAt(p + 4))) return false;
        // v12 saw CRLF as one LF: `href[\s]` took the whole line break.
        this.emit(
          T.Href,
          p,
          p + (this.text.charCodeAt(p + 4) === CR && this.text.charCodeAt(p + 5) === LF ? 6 : 5)
        );
        return true;
      case LOWER_F:
        if (this.kw('flowchart-elk')) return this.graphWord(13);
        return this.kw('flowchart') && this.graphWord(9);
      case LOWER_G:
        return this.kw('graph') && this.graphWord(5);
      case LOWER_E:
        if (!this.kw('end')) return false;
        this.emit(T.End, p, Math.max(p + 3, this.at(RE_END, p)));
        return true;
      case UNDERSCORE:
        for (const target of LINK_TARGETS) {
          if (this.kw(target)) return this.token(T.LinkTarget, target.length);
        }
        return false;
    }
    return false;
  }

  /** A token of `length` characters at p. */
  private token(kind: number, length: number): true {
    this.emit(kind, this.p, this.p + length);
    return true;
  }

  private graphWord(length: number): true {
    this.graph(length);
    return true;
  }

  /** `.*direction\s+XX[^\n]*`, tried only on lines that hold `direction`. */
  private direction(): boolean {
    const p = this.p;
    if (this.dirNext === -1 || p < this.dirFailed) return false;
    if (this.dirNext < p) this.dirNext = this.text.indexOf('direction', p);
    if (this.dirNext === -1) return false;
    if (this.lineEndAt < p) {
      this.lineEndAt = p;
      // Where `.*direction` stops.
      while (this.lineEndAt < this.n && !isLineEnd(this.text.charCodeAt(this.lineEndAt)))
        this.lineEndAt++;
    }
    if (this.dirNext >= this.lineEndAt) return false;
    for (let i = 0; i < RE_DIRECTION.length; i++) {
      const re = RE_DIRECTION[i];
      const e = re ? this.at(re, p) : -1;
      if (e >= 0) {
        this.emit(T.DirectionTB + i, p, e);
        return true;
      }
    }
    // No direction statement starts anywhere in the rest of this line either.
    this.dirFailed = this.lineEndAt;
    return false;
  }

  /** A link id: a run of id characters up to its last `@` not followed by `{` or `"`. */
  private linkId(c: number): boolean {
    const p = this.p;
    if (this.atNext === -1 || this.isRunBreak(c, p)) return false;
    if (p >= this.runEnd) {
      if (this.atNext < p) this.atNext = this.text.indexOf('@', p);
      let q = p;
      while (q < this.n && !this.isRunBreak(this.text.charCodeAt(q), q)) q++;
      this.runEnd = q;
      this.runAt = -1;
      if (this.atNext !== -1 && this.atNext < q) {
        for (let k = Math.min(q, this.n - 1) - 1; k >= this.atNext; k--) {
          if (this.text.charCodeAt(k) !== AT) continue;
          const after = this.text.charCodeAt(k + 1);
          if (after !== LBRACE && !(after === DQUOTE && this.isQuote(k + 1))) {
            this.runAt = k;
            break;
          }
        }
      }
    }
    if (this.runAt <= p) return false;
    this.emit(T.LinkId, p, this.runAt + 1);
    return true;
  }

  /** Numbers, punctuation and the links and shapes they open. */
  private punctuation(c: number): boolean {
    const p = this.p;
    if (isDigit(c)) {
      let e = p + 1;
      while (isDigit(this.text.charCodeAt(e))) e++;
      this.emit(T.Num, p, e);
      return true;
    }
    switch (c) {
      case HASH:
        // v12 turned `#name;` into an entity placeholder that no INITIAL rule matches.
        if (this.entityAt(p)) return false;
        return this.token(T.Brkt, 1);
      case COLON:
        if (this.text.charCodeAt(p + 1) === COLON && this.text.charCodeAt(p + 2) === COLON) {
          return this.token(T.StyleSeparator, 3);
        }
        return this.token(T.Colon, 1);
      case AMP:
        return this.token(T.Amp, 1);
      case SEMI:
        return this.token(T.Semi, 1);
      case COMMA:
        return this.token(T.Comma, 1);
      case STAR:
        return this.token(T.Mult, 1);
      case LOWER_X:
      case LOWER_O:
        return this.link(c) || this.nodeString();
      case LT:
        return this.link(c) || this.token(T.TagStart, 1);
      case DASH:
        return this.link(c) || this.nodeString() || this.token(T.Minus, 1);
      case EQUALS:
        // flow.jison's `=(?!=)` in NODE_STRING compiles to `(?!)` in mermaid@12: `=` never joins an id.
        return this.link(c);
      case DOT:
        return this.link(c) || this.nodeString();
      case TILDE:
        return this.invisLink();
      case LBRACKET:
        if (this.text.charCodeAt(p + 1) === PIPE) return this.token(T.VertexWithPropsStart, 2);
        return this.opener(c);
      case LPAREN:
      case PIPE:
      case LBRACE:
        return this.opener(c);
      case GT:
        this.push(S.text);
        return this.token(T.TagEnd, 1);
      case CARET:
        return this.token(T.Up, 1);
      case BACKSLASH:
        if (this.text.charCodeAt(p + 1) === PIPE) return this.token(T.Sep, 2);
        return this.nodeString();
      case LOWER_V:
        if (!isWord(this.text.charCodeAt(p + 1))) return this.token(T.Down, 1);
        return this.nodeString();
    }
    return false;
  }

  /** Blanks: a link that opens with them, line breaks, or a space token. */
  private blanks(c: number): boolean {
    if (!isSpace(c)) return false;
    // v12 rewrote `}\s*\n` to `}\n` before lexing.
    if (this.text.charCodeAt(this.p - 1) === RBRACE && this.p > this.from) {
      let nl = -1;
      for (let j = this.p; j < this.n && isSpace(this.text.charCodeAt(j)); j++)
        if (isNl(this.text.charCodeAt(j))) nl = j;
      if (nl > this.p) {
        if (this.text.charCodeAt(nl) === LF && this.text.charCodeAt(nl - 1) === CR) nl--;
        this.p = nl;
        this.wsFrom = this.wsTo = -1;
        c = this.text.charCodeAt(nl);
      }
    }
    if (this.link(c)) return true;
    let e: number;
    if ((e = this.newlineEnd(this.p)) >= 0) {
      this.emit(Kind.Newline, this.p, e);
      return true;
    }
    if ((e = this.at(RE_SPACE, this.p)) >= 0) {
      this.emit(T.Space, this.p, e);
      return true;
    }
    return false;
  }

  private word(c: number): boolean {
    if (c <= ASCII_MAX) return this.nodeString();
    if (!isUnicodeLetter(c)) return false;
    return this.token(T.UnicodeText, 1);
  }

  private string(c: number): boolean {
    if (c === DQUOTE && this.isQuote(this.p)) {
      if (this.text.charCodeAt(this.p + 1) === BACKTICK) {
        this.push(S.md_string);
        this.p += 2;
      } else {
        this.pop();
        this.p++;
      }
    } else this.emit(T.Str, this.p, this.nextQuote(this.p));
    return true;
  }

  private mdString(c: number): boolean {
    if (c === BACKTICK) {
      if (!this.isQuote(this.p + 1)) return false;
      this.pop();
      this.p += 2;
      return true;
    }
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.quote();
      return true;
    }
    let q = this.p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (ch === BACKTICK || (ch === DQUOTE && this.isQuote(q))) break;
      q++;
    }
    this.emit(T.MdStr, this.p, q);
    return true;
  }

  private accValue(): boolean {
    let e = this.p;
    while (e < this.n && !isNl(this.text.charCodeAt(e))) e++;
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.pop();
    this.emit(kind, this.p, e);
    return true;
  }

  private accDescrMultiline(c: number): boolean {
    if (c === RBRACE) {
      this.pop();
      this.p++;
    } else this.emit(T.AccDescrMultilineValue, this.p, this.find('}', this.p));
    return true;
  }

  private dir(c: number): boolean {
    const p = this.p;
    let e: number;
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
    } else if ((e = this.noDirEnd(p)) >= 0) {
      this.pop();
      this.emit(T.NoDir, p, e);
    } else if (
      (e = this.at(RE_DIR, p)) >= 0 ||
      (e = this.at(RE_DIR_SYM, p)) >= 0 ||
      (e = this.at(RE_DIR_V, p)) >= 0
    ) {
      this.pop();
      this.emit(T.Dir, p, e);
    } else {
      return this.invisLink() || this.opener(c);
    }
    return true;
  }

  private textState(c: number): boolean {
    const p = this.p;
    const d = this.text.charCodeAt(p + 1);
    switch (c) {
      case LPAREN:
      case LBRACKET:
      case LBRACE:
        return this.opener(c);
      case RBRACKET:
        this.pop();
        if (d === RPAREN) return this.token(T.StadiumEnd, 2);
        if (d === RBRACKET) return this.token(T.SubroutineEnd, 2);
        return this.token(T.SQE, 1);
      case RPAREN:
        this.pop();
        if (d === RBRACKET) return this.token(T.CylinderEnd, 2);
        if (d === RPAREN && this.text.charCodeAt(p + 2) === RPAREN)
          return this.token(T.DoubleCircleEnd, 3);
        return this.token(T.PE, 1);
      case PIPE:
        this.pop();
        return this.token(T.Pipe, 1);
      case RBRACE:
        this.pop();
        return this.token(T.DiamondStop, 1);
    }
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    if ((c === TILDE || isSpace(c)) && this.invisLink()) return true;
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (hasClass(CHARS, ch, TEXT_STOP) || (ch === DQUOTE && this.isQuote(q))) break;
      q++;
    }
    this.emit(T.Text, p, q);
    return true;
  }

  private ellipseText(c: number): boolean {
    const p = this.p;
    const d = this.text.charCodeAt(p + 1);
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    if ((c === TILDE || isSpace(c)) && this.invisLink()) return true;
    if ((c === DASH || c === SLASH || c === RPAREN) && d === RPAREN) {
      this.pop();
      return this.token(T.EllipseEnd, 2);
    }
    if (c === LPAREN || c === LBRACKET || c === LBRACE) return this.opener(c);
    if (c === RPAREN || c === RBRACKET || c === RBRACE) return false;
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (hasClass(CHARS, ch, ELLIPSE_STOP) || (ch === DQUOTE && this.isQuote(q))) break;
      if ((ch === DASH || ch === SLASH) && this.text.charCodeAt(q + 1) === RPAREN) break;
      if ((ch === TILDE || isSpace(ch)) && this.invisAhead(q) && this.at(RE_INVIS_LINK, q) >= 0)
        break;
      // As in edgeText: `\s*~~~` fails alike from every blank of the run.
      if (isSpace(ch)) q = this.blankRunEnd(q);
      q++;
    }
    this.emit(T.Text, p, q);
    return true;
  }

  private trapText(c: number): boolean {
    const p = this.p;
    const d = this.text.charCodeAt(p + 1);
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    if ((c === TILDE || isSpace(c)) && this.invisLink()) return true;
    const end = d === RBRACKET;
    switch (c) {
      case LPAREN:
        if (!end) return this.opener(c);
        this.pop();
        return this.token(T.TrapEnd, 2);
      case LBRACKET:
      case LBRACE:
        return this.opener(c);
      case BACKSLASH:
        if (!end) return this.token(T.Text, 1);
        this.pop();
        return this.token(T.TrapEnd, 2);
      case SLASH:
        if (!end) return this.token(T.Text, 1);
        this.pop();
        return this.token(T.InvTrapEnd, 2);
      case RBRACKET:
      case RPAREN:
        if (!end) return false;
        this.pop();
        return this.token(T.TrapEnd, 2);
      case RBRACE:
        return false;
    }
    if ((c === QUESTION || c === EQUALS) && end) {
      this.pop();
      return this.token(T.TrapEnd, 2);
    }
    let q = p + 1;
    while (q < this.n && !hasClass(CHARS, this.text.charCodeAt(q), TRAP_STOP)) q++;
    this.emit(T.Text, p, q);
    return true;
  }

  /** Edge text of a link opened with `a` (`-`, `=` or `.`); `b` also closes a dotted one. */
  private edgeText(c: number, linkRe: RegExp, a: number, b: number): boolean {
    const p = this.p;
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const d = this.linkChar(p);
    if (d === a || d === b) {
      const e = this.at(linkRe, p);
      if (e >= 0) {
        this.pop();
        return this.linkToken(p, e);
      }
    }
    if (c === a && (a !== DASH || this.text.charCodeAt(p + 1) === DASH)) return false;
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (ch === DQUOTE && this.isQuote(q)) break;
      if (ch === a) {
        if (a !== DASH || this.text.charCodeAt(q + 1) === DASH) break;
      } else if (ch === LOWER_X || ch === LOWER_O || ch === LT || ch === b || isSpace(ch)) {
        const dd = this.linkChar(q);
        if ((dd === a || dd === b) && this.at(linkRe, q) >= 0) break;
        // The link pattern opens with `\s*`: from any later blank of this run it reaches the
        // same character and fails the same way, so the run is skipped (linear, R-PARSE-7).
        if (isSpace(ch)) q = this.blankRunEnd(q);
      }
      q++;
    }
    this.emit(T.EdgeText, p, q);
    return true;
  }

  private click(c: number): boolean {
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.quote();
    } else if (isSpace(c)) {
      this.pop();
      this.p += c === CR && this.text.charCodeAt(this.p + 1) === LF ? 2 : 1;
    } else {
      let q = this.p + 1;
      while (q < this.n && !isSpace(this.text.charCodeAt(q))) q++;
      this.emit(T.Click, this.p, q);
    }
    return true;
  }

  private callbackName(c: number): boolean {
    if (c === LPAREN) {
      const e = this.at(RE_EMPTY_CALL, this.p);
      this.pop();
      if (e >= 0) this.p = e;
      else {
        this.push(S.callbackargs);
        this.p++;
      }
    } else this.emit(T.CallbackName, this.p, this.find('(', this.p));
    return true;
  }

  private callbackArgs(c: number): boolean {
    if (c === RPAREN) {
      this.pop();
      this.p++;
    } else this.emit(T.CallbackArgs, this.p, this.find(')', this.p));
    return true;
  }

  private shapeData(c: number): boolean {
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.push(S.shapeDataStr);
      return this.token(T.ShapeData, 1);
    }
    if (c === RBRACE) {
      this.pop();
      return this.token(T.ShapeDataEnd, 1);
    }
    if (c === CARET) return false;
    let q = this.p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (hasClass(CHARS, ch, SHAPE_DATA_STOP) || (ch === DQUOTE && this.isQuote(q))) break;
      q++;
    }
    this.emit(T.ShapeData, this.p, q);
    return true;
  }

  private shapeDataStr(c: number): boolean {
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.pop();
      return this.token(T.ShapeData, 1);
    }
    this.emit(T.ShapeData, this.p, this.nextQuote(this.p));
    return true;
  }
}
