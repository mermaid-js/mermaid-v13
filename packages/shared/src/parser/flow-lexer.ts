/**
 * The flow family's lexer: a state machine mirroring the start conditions of v12's `flow.jison`
 * (DESIGN §4.3), for flowchart and the diagrams whose jison grammar was cut from flowchart's
 * (agentflow). Ported from Pele's `src/diagrams/flowchart/lexer.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), which is checked token by token
 * against the jison lexer. Changes from Pele:
 * - it lexes the text v12 lexed, with what v12 removed cut out (`sourceView`), and maps each
 *   token back to its range in the source, which is never rewritten. A token that runs over a
 *   removed span is one token whose range covers it;
 * - removed comments and directives are trivia tokens, each with its own range, in source order;
 * - CRLF and CR are line breaks; v12's `encodeEntities` quirks are reproduced;
 * - an unmatched character is an `Error` token, and lexing carries on (for recovery);
 * - the rules every dialect has are here, once. A diagram's lexer extends {@link FlowLexer}
 *   with its token kinds, its keyword table and the rules that differ: its links and edge
 *   text, its blanks, and what it reads inside a label (flowchart's invisible links,
 *   agentflow's comments). Those are called once a token, never once a character.
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words kepano
import {
  AMP,
  ASCII_MAX,
  AT,
  BACKSLASH,
  BACKTICK,
  CARET,
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
  isBlank,
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
  LOWER_H,
  LOWER_O,
  LOWER_V,
  LOWER_X,
  LPAREN,
  LT,
  PERCENT,
  PIPE,
  QUESTION,
  QUOTE,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  STAR,
  TILDE,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import {
  FLOW_STATE as S,
  FLOW_STATE_NAMES,
  LINK_ID_STOP,
  isNl,
  NODE,
  SHAPE_DATA_STOP,
  TEXT_STOP,
  TRAP_STOP,
} from './flow-dialect.ts';
import type { FlowKeywords, FlowLexerDialect } from './flow-dialect.ts';
import type { FlowKinds } from './flow-kinds.ts';
import { StateLexer } from './state-lexer.ts';

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
] as const;
const RE_SPACES = /\s*/y;
const RE_EMPTY_CALL = /\(\s*\)/y;
const RE_ENTITY = /#\w+;/y;
const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'] as const;

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
export abstract class FlowLexer extends StateLexer {
  protected readonly T: FlowKinds;
  protected readonly chars: Uint8Array;
  private readonly keywords: FlowKeywords;
  private readonly trimmed: boolean;
  protected readonly mask: Uint8Array | undefined;
  protected firstGraph: boolean;
  // Memos that keep the scans below linear.
  private dirNext: number;
  private atNext: number;
  private lineEndAt = -1;
  private dirFailed = 0;
  private runEnd = 0;
  private runAt = -1;
  protected wsFrom = -1;
  protected wsTo = -1;

  constructor(
    src: string,
    from: number,
    view: SourceView,
    graphKeyword: boolean,
    dialect: FlowLexerDialect
  ) {
    super(src, from, view, {
      charsPerToken: dialect.charsPerToken,
      // As written (CRs kept).
      crlf: 'raw',
      dropSpace: false,
    });
    this.T = dialect.kinds;
    this.chars = dialect.chars;
    this.keywords = dialect.keywords;
    this.trimmed = dialect.trim;
    this.mask = view.mask;
    this.firstGraph = graphKeyword;
    this.dirNext = this.text.indexOf('direction', this.p);
    this.atNext = this.text.indexOf('@', this.p);
  }

  /**
   * Lex to the end. With a `probe`, the start condition at the probe's offset is recorded as
   * its mode.
   */
  run(probe?: Probe): TokenStream {
    const { T } = this;
    if (this.trimmed && this.firstGraph) this.trim();
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) this.steps();
    else this.probedSteps(probe);
    const kind = this.eofValueKind(this.state);
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
      const mode = FLOW_STATE_NAMES[this.state] ?? '';
      if (!this.step(text.charCodeAt(this.p)) || this.p === before) this.noMatch();
      probe.lexed(this.source(before), this.source(this.p), mode);
    }
    probe.lexed(this.src.length, this.src.length, FLOW_STATE_NAMES[this.state] ?? '');
  }

  /** No rule matches: one Error token over one code point, then resume in the initial state. */
  private noMatch(): void {
    this.emit(Kind.Error, this.p, Math.min(codePointEnd(this.text, this.p), this.n));
    this.stack.length = 0;
    this.state = S.INITIAL;
  }

  // jison's <<EOF>> in states whose value rule matches the empty string: the empty value token.
  private eofValueKind(state: number): number {
    const { T } = this;
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

  // --- What a dialect writes ----------------------------------------------------------------

  /**
   * The INITIAL link rules at p. `c` is the character there: a blank, or one a link may start
   * with (`x`, `o`, `<`, `-`, `=`, `.`, `~`).
   */
  protected abstract link(c: number): boolean;

  /** The INITIAL rules for the blank `c` at p: links, line breaks and spaces. */
  protected abstract blankRule(c: number): boolean;

  /** The edge text states. */
  protected abstract edgeText(c: number): boolean;

  /**
   * The dialect's own rule for `c` at p inside a label or the direction state (the current
   * state says which), tried after the quote rules: whether it matched, or `undefined` when
   * the rule is not for `c`, and the family's rules go on.
   */
  protected abstract labelToken(c: number): boolean | undefined;

  /** The end of the `<ellipseText>` run that starts before `q`. */
  protected abstract ellipseRun(q: number): number;

  // --- Character tests and scans ------------------------------------------------------------

  /** A `"` that v12 had not turned into `'`. */
  protected isQuote(i: number): boolean {
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
  protected blankRunEnd(q: number): number {
    let j = q;
    while (j + 1 < this.n && isSpace(this.text.charCodeAt(j + 1))) j++;
    return j;
  }

  /** End of the sticky `re` matched at `q`, or -1. */
  protected reAt(re: RegExp, q: number): number {
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
  protected newlineEnd(q: number): number {
    let j = q;
    while (j < this.n && isNl(this.text.charCodeAt(j))) j++;
    return j > q ? j : -1;
  }

  private entityAt(q: number): boolean {
    return this.reAt(RE_ENTITY, q) >= 0;
  }

  private kw(word: string): boolean {
    return (
      this.text.startsWith(word, this.p) && !isWord(this.text.charCodeAt(this.p + word.length))
    );
  }

  /** First character after any run of whitespace starting at q. */
  protected skipWs(q: number): number {
    if (q >= this.wsFrom && q <= this.wsTo) return this.wsTo;
    let j = q;
    if (isSpace(this.text.charCodeAt(q))) {
      while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
      this.wsFrom = q;
      this.wsTo = j;
    }
    return j;
  }

  // --- Rules shared by several states -------------------------------------------------------

  protected quote(): void {
    if (this.text.charCodeAt(this.p + 1) === BACKTICK) {
      this.pushState(S.md_string);
      this.p += 2;
    } else {
      this.pushState(S.string);
      this.p++;
    }
  }

  /** The shape openers; `c` is `(`, `[`, `|` or `{`. */
  private opener(c: number): boolean {
    if (c === LPAREN) return this.parenOpener(this.text.charCodeAt(this.p + 1));
    if (c === LBRACKET) return this.bracketOpener(this.text.charCodeAt(this.p + 1));
    if (c === PIPE) return this.open(S.text, this.T.Pipe, 1);
    if (c === LBRACE) return this.open(S.text, this.T.DiamondStart, 1);
    return false;
  }

  /** The openers that start with `(`; `d` is the character after it. */
  private parenOpener(d: number): true {
    const { T } = this;
    if (d === DASH) return this.open(S.ellipseText, T.EllipseStart, 2);
    if (d === LBRACKET) return this.open(S.text, T.StadiumStart, 2);
    if (d === LPAREN && this.text.charCodeAt(this.p + 2) === LPAREN) {
      return this.open(S.text, T.DoubleCircleStart, 3);
    }
    return this.open(S.text, T.PS, 1);
  }

  /** The openers that start with `[`; `d` is the character after it. */
  private bracketOpener(d: number): true {
    const { T } = this;
    if (d === LBRACKET) return this.open(S.text, T.SubroutineStart, 2);
    if (d === LPAREN) return this.open(S.text, T.CylinderStart, 2);
    if (d === SLASH) return this.open(S.trapText, T.TrapStart, 2);
    if (d === BACKSLASH) return this.open(S.trapText, T.InvTrapStart, 2);
    return this.open(S.text, T.SQS, 1);
  }

  private open(state: number, kind: number, length: number): true {
    this.pushState(state);
    return this.token(kind, length);
  }

  /** A token of `length` characters at p. */
  protected token(kind: number, length: number): true {
    this.emit(kind, this.p, this.p + length);
    return true;
  }

  /** A header keyword of `length` characters at p; the first opens the direction state. */
  private graph(length: number): true {
    if (this.firstGraph) {
      this.firstGraph = false;
      this.pushState(S.dir);
    }
    return this.token(this.T.Graph, length);
  }

  protected nodeString(): boolean {
    const { text, n, chars } = this;
    const p = this.p;
    let q = p;
    while (q < n) {
      const ch = text.charCodeAt(q);
      // v12 had turned `#name;` into an entity placeholder, which ends a node string.
      if (ch === HASH && this.entityAt(q)) break;
      if (hasClass(chars, ch, NODE)) {
        q++;
      } else if (ch === DASH && q + 1 < n) {
        const d = text.charCodeAt(q + 1);
        if (d === GT || d === DASH || d === DOT) break;
        q++;
      } else {
        break;
      }
    }
    if (q === p) return false;
    this.emit(this.T.NodeString, p, q);
    return true;
  }

  // mermaid@12.2.0's LINK_ID is `[^\s\"]+\@(?=[^\{\"])`; 12.3.0's flowchart also stops the run at
  // `[ ] ( ) { } |`, the LINK_ID_STOP of `flowChars(…, bracketsEndLinkId)` (D621).
  private isRunBreak(ch: number, q: number): boolean {
    if (hasClass(this.chars, ch, LINK_ID_STOP)) return true;
    return (ch === DQUOTE && this.isQuote(q)) || isSpace(ch);
  }

  // --- States -------------------------------------------------------------------------------

  protected step(c: number): boolean {
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
      case S.thickEdgeText:
      case S.dottedEdgeText:
        return this.edgeText(c);
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

  /** The INITIAL rules, in jison's order. A dialect may put rules of its own before them. */
  protected initial(c: number): boolean {
    return (
      this.keyword(c) ||
      this.direction() ||
      this.linkId(c) ||
      this.punctuation(c) ||
      this.blankRule(c) ||
      this.word(c)
    );
  }

  /** The keyword rules, picked by their first character: the family's, then the dialect's. */
  private keyword(c: number): boolean {
    switch (c) {
      case LOWER_A:
        return this.accKeyword() || this.ownKeyword(c);
      case AT:
        return this.shapeDataStart();
      case LOWER_C:
        return this.cKeyword() || this.ownKeyword(c);
      case DQUOTE:
        return this.quoteStart();
      case LOWER_H:
        return this.href();
      case UNDERSCORE:
        return this.linkTarget();
    }
    return this.ownKeyword(c);
  }

  /** `@{`, which opens shape data. */
  private shapeDataStart(): boolean {
    if (this.text.charCodeAt(this.p + 1) !== LBRACE) return false;
    this.pushState(S.shapeData);
    return this.token(this.T.ShapeData, 2);
  }

  /** A `"` at p that v12 had kept, which opens a string. */
  private quoteStart(): boolean {
    if (!this.isQuote(this.p)) return false;
    this.quote();
    return true;
  }

  /** `href` and the blank after it. */
  private href(): boolean {
    const p = this.p;
    if (!this.text.startsWith('href', p) || !isSpace(this.text.charCodeAt(p + 4))) return false;
    // v12 saw CRLF as one LF: `href[\s]` took the whole line break.
    const crlf = this.text.charCodeAt(p + 4) === CR && this.text.charCodeAt(p + 5) === LF;
    this.emit(this.T.Href, p, p + (crlf ? 6 : 5));
    return true;
  }

  /** `_self`, `_blank`, `_parent` and `_top`. */
  private linkTarget(): boolean {
    for (const target of LINK_TARGETS) {
      if (this.kw(target)) return this.token(this.T.LinkTarget, target.length);
    }
    return false;
  }

  /** `accTitle:`, `accDescr:` and `accDescr {`. */
  private accKeyword(): boolean {
    const { T } = this;
    const p = this.p;
    if (!this.text.startsWith('acc', p)) return false;
    let e: number;
    if ((e = this.reAt(RE_ACC_TITLE, p)) >= 0) {
      this.pushState(S.acc_title);
      this.emit(T.AccTitle, p, e);
      return true;
    }
    if ((e = this.reAt(RE_ACC_DESCR, p)) >= 0) {
      this.pushState(S.acc_descr);
      this.emit(T.AccDescr, p, e);
      return true;
    }
    if ((e = this.reAt(RE_ACC_DESCR_ML, p)) >= 0) {
      this.pushState(S.acc_descr_multiline);
      this.p = e;
      return true;
    }
    return false;
  }

  /** `call`, `classDef`, `class` and `click`, in jison's order. */
  private cKeyword(): boolean {
    const { T } = this;
    const p = this.p;
    let e: number;
    if ((e = this.reAt(RE_CALL, p)) >= 0) {
      this.pushState(S.callbackname);
      this.p = e;
      return true;
    }
    if (this.kw('classDef')) return this.token(T.ClassDef, 8);
    if (this.kw('class')) return this.token(T.Class, 5);
    if ((e = this.reAt(RE_CLICK, p)) >= 0) {
      this.pushState(S.click);
      // The keyword alone; the blanks after it belong to no token, as in jison.
      this.emit(T.ClickKeyword, p, p + 5);
      this.p = e;
      return true;
    }
    return false;
  }

  /** The dialect's keywords that start with `c`. */
  private ownKeyword(c: number): boolean {
    const words = c <= ASCII_MAX ? this.keywords[c] : undefined;
    if (words === undefined) return false;
    for (const row of words) {
      const word = row[0];
      if (!this.kw(word)) continue;
      const tail = row[2];
      if (tail === 'graph') return this.graph(word.length);
      let e = this.p + word.length;
      if (tail === 'blanks') while (isBlank(this.text.charCodeAt(e))) e++;
      else if (tail === 'spaces') e = this.reAt(RE_SPACES, e);
      this.emit(row[1], this.p, e);
      return true;
    }
    return false;
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
      const e = re ? this.reAt(re, p) : -1;
      if (e >= 0) {
        this.emit(this.T.DirectionTB + i, p, e);
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
    if (p >= this.runEnd) this.scanRun(p);
    if (this.runAt <= p) return false;
    this.emit(this.T.LinkId, p, this.runAt + 1);
    return true;
  }

  /** Memoise the run of id characters at `p`: its end, and the `@` that ends its link id. */
  private scanRun(p: number): void {
    if (this.atNext < p) this.atNext = this.text.indexOf('@', p);
    let q = p;
    while (q < this.n && !this.isRunBreak(this.text.charCodeAt(q), q)) q++;
    this.runEnd = q;
    this.runAt = this.atNext !== -1 && this.atNext < q ? this.lastLinkAt(q) : -1;
  }

  /** The last `@` of the run ending at `q` that `{` or `"` does not follow, or -1. */
  private lastLinkAt(q: number): number {
    for (let k = Math.min(q, this.n - 1) - 1; k >= this.atNext; k--) {
      if (this.text.charCodeAt(k) !== AT) continue;
      const after = this.text.charCodeAt(k + 1);
      if (after !== LBRACE && !(after === DQUOTE && this.isQuote(k + 1))) return k;
    }
    return -1;
  }

  /** Numbers, punctuation and the links and shapes they open. */
  private punctuation(c: number): boolean {
    const { T } = this;
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
      case CARET:
        return this.token(T.Up, 1);
    }
    return this.shapeOrLink(c);
  }

  /** The links, shapes and the other characters an id may start with. */
  private shapeOrLink(c: number): boolean {
    switch (c) {
      case LOWER_X:
      case LOWER_O:
      case DOT:
        return this.link(c) || this.nodeString();
      case LT:
        return this.link(c) || this.token(this.T.TagStart, 1);
      case DASH:
        return this.link(c) || this.nodeString() || this.token(this.T.Minus, 1);
      case EQUALS:
      case TILDE:
        // The jison grammars' `=(?!=)` in NODE_STRING compiles to `(?!)` in mermaid@12: `=`
        // never joins an id.
        return this.link(c);
    }
    return this.shape(c);
  }

  /** The shapes, and the characters an id may start with that open no link. */
  private shape(c: number): boolean {
    const { T } = this;
    const p = this.p;
    switch (c) {
      case LBRACKET:
        if (this.text.charCodeAt(p + 1) === PIPE) return this.token(T.VertexWithPropsStart, 2);
        return this.opener(c);
      case LPAREN:
      case PIPE:
      case LBRACE:
        return this.opener(c);
      case GT:
        this.pushState(S.text);
        return this.token(T.TagEnd, 1);
      case BACKSLASH:
        if (this.text.charCodeAt(p + 1) === PIPE) return this.token(T.Sep, 2);
        return this.nodeString();
      case LOWER_V:
        if (!isWord(this.text.charCodeAt(p + 1))) return this.token(T.Down, 1);
        return this.nodeString();
    }
    return false;
  }

  /** What is left: an id, or a letter outside ASCII. A dialect may read more before it. */
  protected word(c: number): boolean {
    if (c <= ASCII_MAX) return this.nodeString();
    if (!isUnicodeLetter(c)) return false;
    return this.token(this.T.UnicodeText, 1);
  }

  private string(c: number): boolean {
    if (c === DQUOTE && this.isQuote(this.p)) {
      if (this.text.charCodeAt(this.p + 1) === BACKTICK) {
        this.pushState(S.md_string);
        this.p += 2;
      } else {
        this.popState();
        this.p++;
      }
    } else this.emit(this.T.Str, this.p, this.nextQuote(this.p));
    return true;
  }

  private mdString(c: number): boolean {
    if (c === BACKTICK) {
      if (!this.isQuote(this.p + 1)) return false;
      this.popState();
      this.p += 2;
      return true;
    }
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.quote();
      return true;
    }
    const { text, n } = this;
    let q = this.p + 1;
    while (q < n) {
      const ch = text.charCodeAt(q);
      if (ch === BACKTICK || (ch === DQUOTE && this.isQuote(q))) break;
      q++;
    }
    this.emit(this.T.MdStr, this.p, q);
    return true;
  }

  private accValue(): boolean {
    const { T } = this;
    let e = this.p;
    while (e < this.n && !isNl(this.text.charCodeAt(e))) e++;
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.popState();
    this.emit(kind, this.p, e);
    return true;
  }

  private accDescrMultiline(c: number): boolean {
    if (c === RBRACE) {
      this.popState();
      this.p++;
    } else this.emit(this.T.AccDescrMultilineValue, this.p, this.find('}', this.p));
    return true;
  }

  private dir(c: number): boolean {
    const { T } = this;
    const p = this.p;
    let e: number;
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
    } else if ((e = this.noDirEnd(p)) >= 0) {
      this.popState();
      this.emit(T.NoDir, p, e);
    } else if (
      (e = this.reAt(RE_DIR, p)) >= 0 ||
      (e = this.reAt(RE_DIR_SYM, p)) >= 0 ||
      (e = this.reAt(RE_DIR_V, p)) >= 0
    ) {
      this.popState();
      this.emit(T.Dir, p, e);
    } else {
      return this.labelToken(c) ?? this.opener(c);
    }
    return true;
  }

  private textState(c: number): boolean {
    const { T } = this;
    const p = this.p;
    const d = this.text.charCodeAt(p + 1);
    switch (c) {
      case LPAREN:
      case LBRACKET:
      case LBRACE:
        return this.opener(c);
      case RBRACKET:
        this.popState();
        if (d === RPAREN) return this.token(T.StadiumEnd, 2);
        if (d === RBRACKET) return this.token(T.SubroutineEnd, 2);
        return this.token(T.SQE, 1);
      case RPAREN:
        this.popState();
        if (d === RBRACKET) return this.token(T.CylinderEnd, 2);
        if (d === RPAREN && this.text.charCodeAt(p + 2) === RPAREN)
          return this.token(T.DoubleCircleEnd, 3);
        return this.token(T.PE, 1);
      case PIPE:
        this.popState();
        return this.token(T.Pipe, 1);
      case RBRACE:
        this.popState();
        return this.token(T.DiamondStop, 1);
    }
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const own = this.labelToken(c);
    if (own !== undefined) return own;
    this.emit(T.Text, p, this.runEndAt(p + 1, TEXT_STOP, true));
    return true;
  }

  /**
   * The end of the label run that starts before `q`: the first character of the class `stop`
   * (a `%` of the class only when another follows it) or, with `quotes`, a quote.
   */
  private runEndAt(q: number, stop: number, quotes: boolean): number {
    const { text, n, chars } = this;
    while (q < n) {
      const ch = text.charCodeAt(q);
      if (hasClass(chars, ch, stop)) {
        if (ch !== PERCENT || text.charCodeAt(q + 1) === PERCENT) break;
      } else if (quotes && ch === DQUOTE && this.isQuote(q)) break;
      q++;
    }
    return q;
  }

  private ellipseText(c: number): boolean {
    const { T } = this;
    const p = this.p;
    const d = this.text.charCodeAt(p + 1);
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const own = this.labelToken(c);
    if (own !== undefined) return own;
    if ((c === DASH || c === SLASH || c === RPAREN) && d === RPAREN) {
      this.popState();
      return this.token(T.EllipseEnd, 2);
    }
    if (c === LPAREN || c === LBRACKET || c === LBRACE) return this.opener(c);
    if (c === RPAREN || c === RBRACKET || c === RBRACE) return false;
    this.emit(T.Text, p, this.ellipseRun(p + 1));
    return true;
  }

  private trapText(c: number): boolean {
    const { T } = this;
    const p = this.p;
    const d = this.text.charCodeAt(p + 1);
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const own = this.labelToken(c);
    if (own !== undefined) return own;
    const end = d === RBRACKET;
    switch (c) {
      case LPAREN:
        if (!end) return this.opener(c);
        this.popState();
        return this.token(T.TrapEnd, 2);
      case LBRACKET:
      case LBRACE:
        return this.opener(c);
      case BACKSLASH:
        if (!end) return this.token(T.Text, 1);
        this.popState();
        return this.token(T.TrapEnd, 2);
      case SLASH:
        if (!end) return this.token(T.Text, 1);
        this.popState();
        return this.token(T.InvTrapEnd, 2);
      case RBRACKET:
      case RPAREN:
        if (!end) return false;
        this.popState();
        return this.token(T.TrapEnd, 2);
      case RBRACE:
        return false;
    }
    if ((c === QUESTION || c === EQUALS) && end) {
      this.popState();
      return this.token(T.TrapEnd, 2);
    }
    this.emit(T.Text, p, this.runEndAt(p + 1, TRAP_STOP, false));
    return true;
  }

  private click(c: number): boolean {
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.quote();
    } else if (isSpace(c)) {
      this.popState();
      this.p += c === CR && this.text.charCodeAt(this.p + 1) === LF ? 2 : 1;
    } else {
      let q = this.p + 1;
      while (q < this.n && !isSpace(this.text.charCodeAt(q))) q++;
      this.emit(this.T.Click, this.p, q);
    }
    return true;
  }

  private callbackName(c: number): boolean {
    if (c === LPAREN) {
      const e = this.reAt(RE_EMPTY_CALL, this.p);
      this.popState();
      if (e >= 0) this.p = e;
      else {
        this.pushState(S.callbackargs);
        this.p++;
      }
    } else this.emit(this.T.CallbackName, this.p, this.find('(', this.p));
    return true;
  }

  private callbackArgs(c: number): boolean {
    if (c === RPAREN) {
      this.popState();
      this.p++;
    } else this.emit(this.T.CallbackArgs, this.p, this.find(')', this.p));
    return true;
  }

  private shapeData(c: number): boolean {
    const { T } = this;
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.pushState(S.shapeDataStr);
      return this.token(T.ShapeData, 1);
    }
    if (c === RBRACE) {
      this.popState();
      return this.token(T.ShapeDataEnd, 1);
    }
    if (c === CARET) return false;
    this.emit(T.ShapeData, this.p, this.runEndAt(this.p + 1, SHAPE_DATA_STOP, true));
    return true;
  }

  private shapeDataStr(c: number): boolean {
    const { T } = this;
    if (c === DQUOTE && this.isQuote(this.p)) {
      this.popState();
      return this.token(T.ShapeData, 1);
    }
    this.emit(T.ShapeData, this.p, this.nextQuote(this.p));
    return true;
  }
}
