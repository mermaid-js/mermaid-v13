/**
 * The agentflow lexer's scanner (`lexer.ts` holds its start conditions): the text v12 lexed
 * (`source.ts`), each token's source range, the removed spans written as trivia, and the
 * character tests and memoised scans its rules share, each linear in the text it reads
 * (R-PARSE-7). Split from the lexer, as flowchart's is one file, only to keep each file short.
 */
import {
  BACKSLASH,
  BACKTICK,
  charTable,
  CR,
  DASH,
  DOT,
  DQUOTE,
  GT,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  LOWER_X,
  LPAREN,
  PERCENT,
  PIPE,
  SEMI,
  SPACE,
  SLASH,
  TAB,
  TokenWriter,
  firstHole,
  localOffset,
  QUOTE,
  SourceOffsets,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

export const RE_ENTITY = /#\w+;/y;

export const isNl = (c: number): boolean => c === LF || c === CR;
/** jison's `[ \t]`. */
export const isTab = (c: number): boolean => c === SPACE || c === TAB;

// Character classes of agentflow.jison's lexer rules.
/** jison's NODE_STRING (`-` and `=` are handled separately). */
export const NODE = 1;
/** Ends a run of `<text>` (with `%%` and a quote). */
export const TEXT_STOP = 2;
/** Ends a run of `<ellipseText>`. */
export const ELLIPSE_STOP = 4;
/** Ends a run of `<trapText>` (with `%%`). */
export const TRAP_STOP = 8;
/** Ends a run of `<shapeData>`. */
export const SHAPE_DATA_STOP = 16;
export const CHARS = /* @__PURE__ */ charTable(
  [NODE, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!"#$%&\'*+.`?\\_/'],
  [TEXT_STOP, '[](){}|'],
  [ELLIPSE_STOP, '()[]{}'],
  [TRAP_STOP, '\\[](){}/'],
  [SHAPE_DATA_STOP, '}^']
);

// Start conditions of agentflow.jison (the ones the lexer needs).
export const S = {
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
  click: 11,
  callbackname: 12,
  callbackargs: 13,
  shapeData: 14,
  shapeDataStr: 15,
} as const;
/**
 * One lex's text, offsets and output. Offsets are into {@link text}, v12's text;
 * {@link emit} maps them to the source.
 */
export class Scanner {
  /** The text v12 lexed, plus the line break v12 appended (clamped in the output). */
  protected readonly text: string;
  /** Length of v12's text without the appended line break. */
  protected readonly len: number;
  protected readonly n: number;
  protected readonly offsets: SourceOffsets | undefined;
  protected readonly mask: Uint8Array | undefined;
  protected readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  protected hole: number;
  protected readonly w: TokenWriter;
  protected readonly stack: number[] = [];
  protected state: number = S.INITIAL;
  protected p: number;
  protected firstGraph: boolean;
  // Memos that keep the scans below linear.
  protected dirNext: number;
  protected atNext: number;
  protected lineEndAt = -1;
  protected dirFailed = 0;
  protected runEnd = 0;
  protected runAt = -1;
  protected wsFrom = -1;
  protected wsTo = -1;
  protected tabFrom = -1;
  protected tabTo = -1;
  /** The links that start after the blanks at {@link linkFrom}: their ends, or -1. */
  protected linkFrom = -1;
  protected linkEnd = -1;
  protected startLinkEnd = -1;
  protected dottedEnd = -1;
  /** The dash run `[dashFrom, dashTo)` last scanned. */
  protected dashFrom = -1;
  protected dashTo = -1;

  constructor(
    protected readonly src: string,
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
    this.p = localOffset(view, from);
    this.firstGraph = graphKeyword;
    // About one token per three characters of agentflow text (blanks are one a token).
    this.w = new TokenWriter((((this.len - this.p) / 3) | 0) + 8);
    this.dirNext = this.text.indexOf('direction', this.p);
    this.atNext = this.text.indexOf('@', this.p);
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  protected source(i: number): number {
    if (i >= this.len) return this.src.length;
    return this.offsets ? this.offsets.source(i) : i;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  protected trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind !== 'drop') this.w.push(Kind.Directive, h.start, h.end);
    }
  }

  /** Write the token `text[s, e)` with its source range, and move past it. */
  protected emit(kind: number, s: number, e: number): void {
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

  /**
   * The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`.
   * The blanks v12 dropped after a `}` belong to no token.
   */
  protected dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' && this.src.charCodeAt(b) === SEMI ? h.end : b;
  }

  protected push(s: number): void {
    this.stack.push(this.state);
    this.state = s;
  }

  protected pop(): void {
    this.state = this.stack.pop() ?? S.INITIAL;
  }

  // --- Character tests and scans ------------------------------------------------------------

  /** A `"` that v12 had not turned into `'`. */
  protected isQuote(i: number): boolean {
    return this.text.charCodeAt(i) === DQUOTE && ((this.mask?.[this.source(i)] ?? 0) & QUOTE) === 0;
  }

  /** `ch` at or after `start`, else the end. */
  protected find(ch: string, start: number): number {
    const e = this.text.indexOf(ch, start);
    return e === -1 ? this.n : e;
  }

  protected nextQuote(from: number): number {
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

  /** The end of the line at `q`: its line break, or the end. */
  protected lineBreak(q: number): number {
    let j = q;
    while (j < this.n && !isNl(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** End of the sticky `re` matched at `q`, or -1. */
  protected at(re: RegExp, q: number): number {
    re.lastIndex = q;
    return re.test(this.text) ? re.lastIndex : -1;
  }

  // jison `(\r?\n)*\s*\n`: a blank run up to its last line feed.
  protected noDirEnd(q: number): number {
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

  protected entityAt(q: number): boolean {
    return this.at(RE_ENTITY, q) >= 0;
  }

  protected kw(word: string): boolean {
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

  /** First character after any run of `[ \t]` starting at q. */
  protected skipTabs(q: number): number {
    if (q >= this.tabFrom && q <= this.tabTo) return this.tabTo;
    let j = q;
    while (j < this.n && isTab(this.text.charCodeAt(j))) j++;
    this.tabFrom = q;
    this.tabTo = j;
    return j;
  }

  /** `%%` not followed by `{` at q: the start of a comment. */
  protected isComment(q: number): boolean {
    return (
      this.text.charCodeAt(q) === PERCENT &&
      this.text.charCodeAt(q + 1) === PERCENT &&
      this.text.charCodeAt(q + 2) !== LBRACE
    );
  }

  /**
   * The links after the blanks at `q`: `\s*--+[x>]\s*`, `\s*--\s*` and `\s*-.+-\s*`. They
   * differ only after the blanks, so the result is kept for the character after them, and the
   * end of a dash run is kept too: from any blank of a run, and from any dash of a dash run,
   * the scans run once (linear, R-PARSE-7).
   */
  protected links(q: number): void {
    const j = this.skipWs(q);
    if (j === this.linkFrom) return;
    this.linkFrom = j;
    this.linkEnd = this.startLinkEnd = this.dottedEnd = -1;
    const t = this.text;
    if (t.charCodeAt(j) !== DASH) return;
    const d = t.charCodeAt(j + 1);
    if (d === DASH) {
      const e = this.dashRunEnd(j);
      const c = t.charCodeAt(e);
      const startEnd = this.skipWs(j + 2);
      if (c === LOWER_X || c === GT) this.linkEnd = this.skipWs(e + 1);
      this.startLinkEnd = startEnd;
    } else if (d === DOT) {
      let e = j + 2;
      while (t.charCodeAt(e) === DOT) e++;
      if (t.charCodeAt(e) === DASH) this.dottedEnd = this.skipWs(e + 1);
    }
  }

  /** The end of the dash run at `j`; each run is scanned once. */
  protected dashRunEnd(j: number): number {
    if (j < this.dashFrom || j >= this.dashTo) {
      let e = j;
      while (this.text.charCodeAt(e) === DASH) e++;
      this.dashFrom = j;
      this.dashTo = e;
    }
    return this.dashTo;
  }

  // --- Rules shared by several states -------------------------------------------------------

  protected quote(): void {
    if (this.text.charCodeAt(this.p + 1) === BACKTICK) {
      this.push(S.md_string);
      this.p += 2;
    } else {
      this.push(S.string);
      this.p++;
    }
  }

  /** The shape openers; `c` is `(`, `[`, `|` or `{`. */
  protected opener(c: number): boolean {
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

  protected open(state: number, kind: number, length: number): true {
    this.push(state);
    return this.token(kind, length);
  }

  /** A token of `length` characters at p. */
  protected token(kind: number, length: number): true {
    this.emit(kind, this.p, this.p + length);
    return true;
  }
}
