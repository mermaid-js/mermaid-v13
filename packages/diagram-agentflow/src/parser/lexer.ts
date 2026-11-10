/**
 * Agentflow lexer: a state machine mirroring the start conditions of v12's `agentflow.jison`
 * (DESIGN §4.3). Written from a copy of v13 flowchart's lexer (D467, itself a port of Pele's,
 * MIT), cut down by the jison diff between `agentflow.jison` and `flow.jison`:
 * - no `subgraph`, `graph`, `flowchart` or `swimlane-beta`; `agentflow-beta` opens the
 *   direction state, and `flow`, `connector`, `global\b[ \t]*` and `end\b[ \t]*` are keywords;
 * - links are `--+[x>]`, `--` (opening edge text, closed by `--+[x>]`) and `-.+-` only: no
 *   `[xo<]` prefixes, no thick, dotted-open or invisible links, no thick or dotted edge text;
 * - `SPACE` is one blank a token;
 * - comments are in the text (see `source.ts`): `[ \t]*%%…` outside labels is a `Comment`
 *   token, and `%%…` inside a text, ellipse or trapezoid label is skipped (`Kind.Comment`);
 * - a lone `%` is label text, as the jison rules `%(?!%)` intend (D463): mermaid 12.2.0
 *   compiled them to `(?!)` and stops there with a lexical error.
 *
 * Like flowchart's, it lexes the text v12 lexed and maps each token back to its range in the
 * source, which is never rewritten; directives are trivia tokens, each with its own range, in
 * source order; CRLF and CR are line breaks; an unmatched character is an `Error` token, and
 * lexing carries on (for recovery).
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 *
 * Flowchart's lexer is ported from Pele's `src/diagrams/flowchart/lexer.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
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
  LOWER_D,
  LOWER_E,
  LOWER_F,
  LOWER_G,
  LOWER_H,
  LOWER_I,
  LOWER_L,
  LOWER_S,
  LOWER_V,
  LPAREN,
  LT,
  PERCENT,
  PIPE,
  QUESTION,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  STAR,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import {
  CHARS,
  ELLIPSE_STOP,
  isNl,
  NODE,
  S,
  Scanner,
  SHAPE_DATA_STOP,
  TEXT_STOP,
  TRAP_STOP,
} from './scanner.ts';
import { T } from './tokens.ts';

/** Start condition names by number, for the probe's lexer mode. */
const S_NAMES: Readonly<Record<number, string>> = /* @__PURE__ */ Object.fromEntries(
  Object.entries(S).map(([name, value]) => [value, name])
);

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
const RE_EMPTY_CALL = /\(\s*\)/y;
const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'];
/** The keywords that are one token of their own, by first character (jison adds `\b`). */
const WORDS: ReadonlyMap<number, readonly [string, number]> = /* @__PURE__ */ new Map([
  [LOWER_S, ['style', T.Style]],
  [LOWER_D, ['default', T.Default]],
  [LOWER_L, ['linkStyle', T.LinkStyle]],
  [LOWER_I, ['interpolate', T.Interpolate]],
  [LOWER_F, ['flow', T.Flow]],
]);

/**
 * Lex the agentflow body `src[from…]`. `view` comes from `agentflowSourceView`. With
 * `graphKeyword` false, an `agentflow-beta` keyword no longer opens the direction state (used
 * when lexing restarts mid-document after an error). With a `probe`, the start condition at
 * the probe's offset is recorded as its mode.
 */
export function lex(
  src: string,
  from: number,
  view: SourceView,
  graphKeyword = true,
  probe?: Probe
): TokenStream {
  return new AgentflowLexer(src, from, view, graphKeyword).run(probe);
}

/** One lex: the start conditions of agentflow.jison, each a method named after it. */
class AgentflowLexer extends Scanner {
  run(probe?: Probe): TokenStream {
    // v12 lexed agentflow's text untrimmed: leading blanks and comments are tokens.
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

  /** The INITIAL links at p: `--+[x>]`, then `--` (opening edge text), then `-.+-`. */
  private link(): boolean {
    const p = this.p;
    const { link, startLink, dotted } = this.links(p);
    if (link >= 0) return this.token(T.Link, link - p);
    if (startLink >= 0) {
      this.push(S.edgeText);
      return this.token(T.StartLink, startLink - p);
    }
    return dotted >= 0 && this.token(T.Link, dotted - p);
  }

  /** `[ \t]*"%%"(?!\{)[^\n]*` at p: a comment, to its line break. */
  private comment(): boolean {
    const j = this.skipTabs(this.p);
    if (!this.isComment(j)) return false;
    this.emit(T.Comment, this.p, this.lineBreak(j));
    return true;
  }

  /** A label's `"%%"(?!\{)[^\n]*`, which jison skips: trivia. */
  private labelComment(): boolean {
    if (!this.isComment(this.p)) return false;
    this.emit(Kind.Comment, this.p, this.lineBreak(this.p));
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

  private initial(c: number): boolean {
    return (
      this.keyword(c) ||
      this.direction() ||
      this.linkId(c) ||
      this.punctuation(c) ||
      this.blanks(c) ||
      (c === PERCENT && this.comment()) ||
      this.word(c)
    );
  }

  /** The keyword rules, picked by their first character. */
  private keyword(c: number): boolean {
    const p = this.p;
    switch (c) {
      case LOWER_A:
        return this.accOrHeader();
      case AT:
        if (this.text.charCodeAt(p + 1) !== LBRACE) return false;
        this.push(S.shapeData);
        this.emit(T.ShapeData, p, p + 2);
        return true;
      case LOWER_C:
        return this.cKeyword();
      case DQUOTE:
        if (!this.isQuote(p)) return false;
        this.quote();
        return true;
      case LOWER_H:
        if (!this.text.startsWith('href', p) || !isSpace(this.text.charCodeAt(p + 4))) return false;
        // v12 saw CRLF as one LF: `href[\s]` took the whole line break.
        this.emit(
          T.Href,
          p,
          p + (this.text.charCodeAt(p + 4) === CR && this.text.charCodeAt(p + 5) === LF ? 6 : 5)
        );
        return true;
      case LOWER_G:
        return this.kw('global') && this.blankEnded(T.Global, 6);
      case LOWER_E:
        return this.kw('end') && this.blankEnded(T.End, 3);
      case UNDERSCORE:
        for (const target of LINK_TARGETS) {
          if (this.kw(target)) return this.token(T.LinkTarget, target.length);
        }
        return false;
    }
    const word = WORDS.get(c);
    return word !== undefined && this.kw(word[0]) && this.token(word[1], word[0].length);
  }

  /** `accTitle:`, `accDescr:`, `accDescr {` and the `agentflow-beta` header. */
  private accOrHeader(): boolean {
    const p = this.p;
    let e: number;
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
    if (!this.kw('agentflow-beta')) return false;
    this.graph(14);
    return true;
  }

  /** `call`, `classDef`, `class`, `click` and `connector`, in jison's order. */
  private cKeyword(): boolean {
    const p = this.p;
    let e: number;
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
    return this.kw('connector') && this.token(T.Connector, 9);
  }

  /** A keyword of `length` characters at p and the `[ \t]*` after it (`global`, `end`). */
  private blankEnded(kind: number, length: number): true {
    let e = this.p + length;
    while (isBlank(this.text.charCodeAt(e))) e++;
    this.emit(kind, this.p, e);
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
      case LT:
        return this.token(T.TagStart, 1);
      case CARET:
        return this.token(T.Up, 1);
    }
    return this.shapeOrLink(c);
  }

  /** The links, shapes and the other characters an id may start with. */
  private shapeOrLink(c: number): boolean {
    const p = this.p;
    switch (c) {
      case DASH:
        return this.link() || this.nodeString() || this.token(T.Minus, 1);
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
      case BACKSLASH:
        if (this.text.charCodeAt(p + 1) === PIPE) return this.token(T.Sep, 2);
        return this.nodeString();
      case LOWER_V:
        if (!isWord(this.text.charCodeAt(p + 1))) return this.token(T.Down, 1);
        return this.nodeString();
    }
    // `=`: agentflow.jison's `=(?!=)` in NODE_STRING compiles to `(?!)` in mermaid 12.2.0, so
    // `=` never joins an id, and no other rule reads it (word() rejects it).
    return false;
  }

  /** Blanks: a link that opens with them, a comment, line breaks, or one blank. */
  private blanks(c: number): boolean {
    if (!isSpace(c)) return false;
    if (this.link()) return true;
    if (isBlank(c) && this.comment()) return true;
    const e = this.newlineEnd(this.p);
    if (e >= 0) {
      this.emit(Kind.Newline, this.p, e);
      return true;
    }
    return this.token(T.Space, 1);
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
      return this.opener(c);
    }
    return true;
  }

  /** `%` in a text or trapezoid run at q: v13 reads `%(?!%)` as jison's rule intends (D463). */
  private percentEnds(q: number): boolean {
    return this.text.charCodeAt(q + 1) === PERCENT;
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
    if (c === PERCENT && this.percentEnds(p)) return this.labelComment();
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (hasClass(CHARS, ch, TEXT_STOP) || (ch === DQUOTE && this.isQuote(q))) break;
      if (ch === PERCENT && this.percentEnds(q)) break;
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
    if (this.labelComment()) return true;
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
      if (this.isComment(q)) break;
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
      case PERCENT:
        if (this.percentEnds(p)) return this.labelComment();
    }
    if ((c === QUESTION || c === EQUALS) && end) {
      this.pop();
      return this.token(T.TrapEnd, 2);
    }
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (hasClass(CHARS, ch, TRAP_STOP) || (ch === PERCENT && this.percentEnds(q))) break;
      q++;
    }
    this.emit(T.Text, p, q);
    return true;
  }

  /** Edge text after `--`, closed by `--+[x>]`. */
  private edgeText(c: number): boolean {
    const p = this.p;
    if (c === DQUOTE && this.isQuote(p)) {
      this.quote();
      return true;
    }
    const { link } = this.links(p);
    if (link >= 0) {
      this.pop();
      return this.token(T.Link, link - p);
    }
    if (c === DASH && this.text.charCodeAt(p + 1) === DASH) return false;
    let q = p + 1;
    while (q < this.n) {
      const ch = this.text.charCodeAt(q);
      if (ch === DQUOTE && this.isQuote(q)) break;
      if (ch === DASH) {
        if (this.text.charCodeAt(q + 1) === DASH) break;
      } else if (isSpace(ch)) {
        if (this.links(q).link >= 0) break;
        // The link pattern opens with `\s*`: from any later blank of this run it reaches the
        // same character and fails the same way, so the run is skipped (linear, R-PARSE-7).
        q = this.blankRunEnd(q);
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
