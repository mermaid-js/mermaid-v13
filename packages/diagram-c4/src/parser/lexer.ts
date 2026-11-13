/**
 * C4 lexer: a state machine mirroring the start conditions and rule order of v12's
 * `c4Diagram.jison` (parser-method §1):
 * - it lexes the text v12 lexed: comments and directives cut out ({@link sourceView}), line
 *   breaks as v12 had them (CRLF and CR as LF), tag quotes as `'` and each `#name;` entity as a
 *   placeholder no rule stops at, and maps each token back to its range in the source, which is
 *   never rewritten. A token that runs over a removed span is one token whose range covers it;
 * - comment lines and directives are trivia tokens, each with its own range, in source order;
 *   so is a dropped `;` that no token took (`Space`), a mid-line `%%` comment and the blanks
 *   the lexer skips.
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-sensitive and every keyword ends in `\b`; the four `.*direction\s+(TB|BT|RL|LR)[^\n]*`
 * rules come first, so a line holding `direction LR` anywhere after the token start is one
 * token (the last such `direction` on the line; a `.` stops at LF, U+2028 and U+2029, its
 * `\s+` does not); `title\s[^\n;]+` takes a blank other than a line break;
 * `\s*(\r?\n)+` (`NEWLINE`) takes the blanks before the last line break of a blank run; the
 * macro states have no blank rule, so `Person (a)` is an error at the blank; a quoted value has
 * no escapes; `$name` reads `[^=]*`.
 *
 * D452 changes three rules, each a listed exclusion of the lexer-parity gate: an unquoted value
 * is `[^,)\n]+` (v12's `[^,]+` ran over `)` and line breaks to the next comma), and a line break
 * in the arguments leaves them, the macro open; a `%%` comment leaves the line breaks after it
 * to `NEWLINE` (v12's ate them); a `title` right before a line break is a title with no text
 * (v12's `\s` took the line break, so the next line was the title). #683 changes one more:
 * `title` and `accDescription` run over a `#` (`[^\n;]+`, as v12's fix mermaid-js/mermaid#8039;
 * 12.2.0's `[^#\n;]+` stopped there, and the rest of the line was a lexical error), also a listed
 * exclusion of the gate. The rules that return no
 * token (`(`, `)`, `,`, the quotes, `$`, `="`, `accDescr {` and its `}`) are kinds of their
 * own with no jison name. At the end jison tries the current state's rules once more on the
 * empty text: `EOF` in INITIAL, `EOF_IN_STRUCT` right after a macro keyword (never reached:
 * jison throws at the line break v12 appended first), and an empty `STR`, accessibility value
 * or `accDescr {` value.
 *
 * jison throws where no rule matches (`;`, an unknown word, a blank in a macro state, `$k=x`);
 * each is a one-character `Kind.Error` and lexing goes on in the same state, except at a line
 * break after a macro name or in `$name=`: a zero-width error there leaves the macro's states,
 * so the parser can go on at the next line. Every scan is
 * linear in the text it consumes (R-PARSE-7): the `direction` rules are looked up once per
 * line, and a keyword is read no further than one past the longest one.
 */
import {
  COLON,
  COMMA,
  LOWER_A,
  CR,
  DQUOTE,
  EQUALS,
  firstHole,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  localOffset,
  LPAREN,
  PERCENT,
  QUOTE,
  RBRACE,
  RPAREN,
  SEMI,
  SourceOffsets,
  SPACE,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { HEADERS, KEYWORD_MAX, KEYWORDS, T } from './tokens.ts';

const DOLLAR = 0x24;

// Start conditions of c4Diagram.jison. Its 38 macro states share the same four rules, so they
// are one here; `index` and `rel_bi` are declared and never entered.
const S = {
  INITIAL: 0,
  MACRO: 1,
  ATTRIBUTE: 2,
  STRING: 3,
  STRING_KV: 4,
  STRING_KV_KEY: 5,
  STRING_KV_VALUE: 6,
  ACC_TITLE: 7,
  ACC_DESCR: 8,
  ACC_DESCR_MULTILINE: 9,
} as const;

/**
 * Start condition names by number, for the probe's lexer mode (R-LANG-7): jison's names are
 * the keys of {@link S}, lower-cased but `INITIAL`.
 */
const S_NAMES: readonly string[] = (() => {
  const out: string[] = [];
  for (const [key, n] of Object.entries(S)) out[n] = key === 'INITIAL' ? key : key.toLowerCase();
  return out;
})();

/** What a regex `.` does not match, once CRs are LFs. */
// LF, U+2028 (line separator) and U+2029 (paragraph separator).
const DOT_ENDS = ['\n', '\u2028', '\u2029'] as const;

/** The four `direction` rules, in order: the two letters after the blanks, and the kind. */
const DIRECTIONS: readonly (readonly [string, number])[] = [
  ['TB', T.DirectionTB],
  ['BT', T.DirectionBT],
  ['RL', T.DirectionRL],
  ['LR', T.DirectionLR],
];
const DIRECTION = 'direction';

/** `title\s[^\n;]+` and `accDescription\s[^\n;]+`, in order (#683: v12's had `#` in the class). */
const TITLES: readonly (readonly [string, number])[] = [
  ['title', T.Title],
  ['accDescription', T.AccDescription],
];

const LOWER_T = 0x74;

const ACC_TITLE = 'accTitle';
const ACC_DESCR = 'accDescr';

/**
 * The token each state's rules give on the empty text at the end, by state. ATTRIBUTE,
 * STRING_KV_KEY and STRING_KV_VALUE match nothing there; STRING_KV never gets there (`[^=]*`
 * takes the line break v12 appended).
 */
const END_KINDS: Readonly<Partial<Record<number, number>>> = {
  [S.INITIAL]: T.Eof,
  [S.MACRO]: T.EofInStruct,
  [S.STRING]: T.Str,
  [S.ACC_TITLE]: T.AccTitleValue,
  [S.ACC_DESCR]: T.AccDescrValue,
  [S.ACC_DESCR_MULTILINE]: T.AccDescrBlockValue,
};

/** Stands for the `#` of an entity v12 encoded: no rule stops at it, as at v12's placeholder. */
// U+FB02 (LATIN SMALL LIGATURE FL), the first character of v12's placeholder.
const ENTITY = '\ufb02';
/** Stands for the entity's `;`. */
// U+00B6 (the paragraph sign), the first character of the placeholder's end.
const ENTITY_END = '\u00b6';

/**
 * Lex the C4 body `src[from…]`. `view` comes from {@link sourceView} with default options
 * (v12's c4 ran every shared rewrite). The stream ends in `Kind.EOF`; trivia is in it. With a
 * `probe`, the start condition at the probe's offset is recorded as its mode (R-LANG-7).
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new C4Lexer(src, from, view).run(probe);
}

/**
 * The view's text as v12's lexer read it, of the same length: tag quotes v12 turned into `'`
 * are `'`, and the `#` and `;` of each `#name;` entity are {@link ENTITY} and
 * {@link ENTITY_END} (v12's placeholder holds neither, and `title` and `accDescription` stop
 * at a `;`).
 */
function rewritten(view: SourceView, offsets: SourceOffsets | undefined): string {
  const { text, mask } = view;
  let out = text.includes('#')
    ? text.replace(/#(\w+);/g, (_m, name: string) => `${ENTITY}${name}${ENTITY_END}`)
    : text;
  if (mask && out.includes('"')) {
    out = out.replace(/"/g, (q, i: number) =>
      ((mask[offsets ? offsets.source(i) : i] ?? 0) & QUOTE) !== 0 ? "'" : q
    );
  }
  return out;
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class C4Lexer {
  /** The text v12 lexed (line breaks as LF), plus the line break v12 appended. */
  private readonly text: string;
  /** Length of v12's text without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  /**
   * `at[i]` is the view-text offset of `text[i]` (`at[len]` its end), when a CR made the two
   * differ; else undefined and they are the same.
   */
  private readonly at: Uint32Array | undefined;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  private covered = 0;
  private readonly w: TokenWriter;
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private p: number;
  /** The next line end a regex `.` stops at, cached for {@link dotEnd} (-2: not looked up). */
  private readonly nextEnd = [-2, -2, -2];
  /** The next `direction` at or after the last lookup (-2: not looked up, -1: none). */
  private nextDirection = -2;
  /** The line end the `direction` matches below are for (-1: none yet). */
  private directionLine = -1;
  /** Per `direction` rule: the last start on that line where it matches, or -1. */
  private readonly directionAt = [-1, -1, -1, -1];
  /** Per `direction` rule: where that match ends. */
  private readonly directionEnd = [0, 0, 0, 0];

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    const start = localOffset(view, from);
    const { text, at } = this.v12Text(rewritten(view, this.offsets), start);
    this.at = at;
    this.len = text.length;
    this.text = text + '\n';
    this.n = this.text.length;
    this.p = start;
    // About one token per five characters of C4 text.
    this.w = new TokenWriter((((this.len - this.p) / 5) | 0) + 8);
  }

  /**
   * `raw` with every CRLF and lone CR as one LF, as v12 had it, and where each character came
   * from. A CR and an LF that a removed span left side by side are two line ends: v12 turned
   * CRs into LFs before it removed anything. Offsets before `start` are kept as they are.
   */
  private v12Text(raw: string, start: number): { text: string; at: Uint32Array | undefined } {
    if (!raw.includes('\r', start)) return { text: raw, at: undefined };
    const at = new Uint32Array(raw.length + 1);
    const out: string[] = [];
    let k = 0;
    let run = 0;
    for (let q = 0; q < raw.length; q++) {
      at[k++] = q;
      if (raw.charCodeAt(q) !== CR) continue;
      out.push(raw.slice(run, q), '\n');
      run = q + 1;
      if (q >= start && raw.charCodeAt(q + 1) === LF && this.adjacent(q)) {
        q++;
        run = q + 1;
      }
    }
    out.push(raw.slice(run));
    at[k] = raw.length;
    return { text: out.join(''), at: at.subarray(0, k + 1) };
  }

  /** Whether view-text offsets `q` and `q + 1` are next to each other in the source. */
  private adjacent(q: number): boolean {
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1;
  }

  run(probe?: Probe): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    const start = this.p;
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    if (this.p > start) this.emit(Kind.Space, start, this.p);
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) while (this.p < n) this.step(text.charCodeAt(this.p));
    else {
      probe.lexed(this.source(start), this.source(this.p), S_NAMES[S.INITIAL] ?? '');
      while (this.p < n) {
        const before = this.source(this.p);
        const state = this.state;
        this.step(text.charCodeAt(this.p));
        // An opener's text is read in the state before it, a closer's in the one it leaves.
        probe.lexed(before, this.source(this.p), S_NAMES[state] ?? '');
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    }
    this.end();
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /**
   * At the end jison tries the current state's rules once more on the empty text; the ones
   * that match it give one zero-width token, then jison ends with `$end`.
   */
  private end(): void {
    const kind = END_KINDS[this.state];
    if (kind !== undefined) this.emit(kind, this.len, this.len);
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** View-text offset of `text[i]`. */
  private view(i: number): number {
    return this.at ? (this.at[i] ?? 0) : i;
  }

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  private source(i: number): number {
    if (i >= this.len) return this.src.length;
    const v = this.view(i);
    return this.offsets ? this.offsets.source(v) : v;
  }

  /** Source offset just past the last source character of `text[i]` (a CRLF's LF). */
  private sourceEnd(i: number): number {
    const v = this.view(i + 1) - 1;
    return (this.offsets ? this.offsets.source(v) : v) + 1;
  }

  /**
   * Write the removed spans that start before `at` (a source offset) as trivia. A dropped `;`
   * that no token's range took (one after skipped blanks) is a `Space` token of its own.
   */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
      else if (h.start >= this.covered) this.w.push(Kind.Space, h.start, h.end);
    }
  }

  /** Write the token `text[s, end)` with its source range, and move to `end`. */
  private emit(kind: number, s: number, end: number): void {
    const a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.sourceEnd(last - 1) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    if (b > this.covered) this.covered = b;
    this.p = end;
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }

  /** Write the token `text[p, end)` and enter `state` (jison `begin`). */
  private begin(kind: number, end: number, state: number): void {
    this.emit(kind, this.p, end);
    this.stack.push(this.state);
    this.state = state;
  }

  /** jison `popState`: the state below; the bottom one stays. */
  private popState(): void {
    this.state = this.stack.pop() ?? S.INITIAL;
  }

  /** Write the token `text[p, end)` and leave the current state. */
  private pop(kind: number, end: number): void {
    this.emit(kind, this.p, end);
    this.popState();
  }

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The first line end a regex `.` stops at (LF, U+2028, U+2029; CRs are LFs by now) at or
   * after `q`, else the end. Found with `indexOf`, keeping the next of each; `q` never
   * decreases between calls, so all calls cost one pass over the text.
   */
  private dotEnd(q: number): number {
    let min = this.n;
    for (let k = 0; k < DOT_ENDS.length; k++) {
      let e = this.nextEnd[k] ?? -1;
      if (e !== -1 && e < q) this.nextEnd[k] = e = this.text.indexOf(DOT_ENDS[k] ?? '', q);
      if (e !== -1 && e < min) min = e;
    }
    return min;
  }

  /** The end of the run of `\s` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of U+0020 (`[ ]*`) from `q`. */
  private spaces(q: number): number {
    let j = q;
    while (this.text.charCodeAt(j) === SPACE) j++;
    return j;
  }

  /** The first `c` at or after `q`, or the end of the text. */
  private find(c: string, q: number): number {
    const e = this.text.indexOf(c, q);
    return e === -1 ? this.n : e;
  }

  /**
   * Which `direction` rule matches at `p`, as its index into {@link DIRECTIONS}, or -1. `.*`
   * is greedy, so a rule matches at the last `direction` on the line (up to the next line end
   * a `.` stops at) where it does; any such start at or after `p` will do. The matches are
   * found once per line, the first time a token starts on it.
   */
  private direction(p: number): number {
    const line = this.dotEnd(p);
    if (line !== this.directionLine) this.directionsOn(p, line);
    for (let k = 0; k < DIRECTIONS.length; k++) if ((this.directionAt[k] ?? -1) >= p) return k;
    return -1;
  }

  /** Find the `direction` matches of the line `[from, line)`. */
  private directionsOn(from: number, line: number): void {
    const { text } = this;
    this.directionLine = line;
    this.directionAt.fill(-1);
    let s = this.nextDirection;
    if (s !== -1 && s < from) s = text.indexOf(DIRECTION, from);
    while (s !== -1 && s < line) {
      const b = this.blanks(s + DIRECTION.length);
      if (b > s + DIRECTION.length) {
        const two = text.slice(b, b + 2);
        for (let k = 0; k < DIRECTIONS.length; k++) {
          if (DIRECTIONS[k]?.[0] !== two) continue;
          this.directionAt[k] = s;
          this.directionEnd[k] = this.find('\n', b + 2);
        }
      }
      s = text.indexOf(DIRECTION, s + 1);
    }
    this.nextDirection = s;
  }

  /** Whether `word` is at `q`. */
  private startsWith(word: string, q: number): boolean {
    return this.text.startsWith(word, q);
  }

  /** The end of `[^\n;]+` from `q` (`q` when it matches nothing). */
  private titleText(q: number): number {
    let j = q;
    for (let c = this.text.charCodeAt(j); j < this.n; c = this.text.charCodeAt(++j)) {
      if (c === LF || c === SEMI) break;
    }
    return j;
  }

  // --- States -------------------------------------------------------------------------------

  private step(c: number): void {
    switch (this.state) {
      case S.INITIAL:
        this.initial(c);
        return;
      case S.MACRO:
        this.macro(c);
        return;
      case S.ATTRIBUTE:
        this.attribute(c);
        return;
      case S.STRING:
        this.string(c);
        return;
      case S.STRING_KV:
        this.begin(T.StrKey, this.find('=', this.p), S.STRING_KV_KEY);
        return;
      case S.STRING_KV_KEY:
        this.stringKvKey(c);
        return;
      case S.STRING_KV_VALUE:
        this.stringKvValue(c);
        return;
      case S.ACC_TITLE:
        this.pop(T.AccTitleValue, this.find('\n', this.p));
        return;
      case S.ACC_DESCR:
        this.pop(T.AccDescrValue, this.find('\n', this.p));
        return;
      default:
        this.accDescrMultiline(c);
    }
  }

  private initial(c: number): void {
    const { text, p } = this;
    // `.*direction\s+(TB|BT|RL|LR)[^\n]*`, before every other rule.
    const d = this.direction(p);
    if (d >= 0) {
      this.emit(DIRECTIONS[d]?.[1] ?? T.DirectionTB, p, this.directionEnd[d] ?? this.n);
      return;
    }
    // `title\s[^\n;]+` and `accDescription\s[^\n;]+`.
    if ((c === LOWER_T || c === LOWER_A) && this.title(p)) return;
    // `accTitle\s*:\s*`, `accDescr\s*:\s*`, `accDescr\s*\{\s*`.
    if (this.startsWith('acc', p) && this.accessibility(p)) return;
    // `%%[^\n]*`: a comment. v12's `(\r?\n?)+` after it ate the line breaks; D452 leaves
    // them to `NEWLINE`.
    if (c === PERCENT && text.charCodeAt(p + 1) === PERCENT) {
      this.emit(Kind.Comment, p, this.find('\n', p + 2));
      return;
    }
    if (isSpace(c)) {
      // `\s*(\r?\n)+`: the blanks up to the last line break of their run, else `\s+`.
      const b = this.blanks(p);
      let l = b - 1;
      while (l >= p && text.charCodeAt(l) !== LF) l--;
      if (l >= p) this.emit(Kind.Newline, p, l + 1);
      else this.emit(Kind.Space, p, b);
      return;
    }
    // The headers and macros, each word-bounded.
    if (isWord(c)) {
      let e = p + 1;
      while (e < this.n && e <= p + KEYWORD_MAX && isWord(text.charCodeAt(e))) e++;
      const kind = KEYWORDS.get(text.slice(p, e));
      if (kind !== undefined) {
        if (HEADERS.has(kind)) this.emit(kind, p, e);
        else this.begin(kind, e, S.MACRO);
        return;
      }
    }
    if (c === LBRACE) this.emit(T.LBrace, p, p + 1);
    else if (c === RBRACE) this.emit(T.RBrace, p, p + 1);
    else this.emit(Kind.Error, p, p + 1);
  }

  /**
   * The `title` and `accDescription` rules at `p`; whether one matched. D452: a `title` right
   * before a line break is a title of its own, with no text (v12's `\s` took the line break and
   * the next line as the title).
   */
  private title(p: number): boolean {
    for (const [word, kind] of TITLES) {
      const q = p + word.length;
      if (kind === T.Title && this.text.charCodeAt(q) === LF && this.startsWith(word, p)) {
        this.emit(kind, p, q);
        return true;
      }
      if (this.startsWith(word, p) && isSpace(this.text.charCodeAt(q))) {
        const e = this.titleText(q + 1);
        if (e > q + 1) {
          this.emit(kind, p, e);
          return true;
        }
      }
    }
    return false;
  }

  /** The `accTitle` and `accDescr` rules at `p` (after `acc`); whether one matched. */
  private accessibility(p: number): boolean {
    const { text } = this;
    const title = this.startsWith(ACC_TITLE, p);
    if (!title && !this.startsWith(ACC_DESCR, p)) return false;
    // Both words are as long.
    const b = this.blanks(p + ACC_TITLE.length);
    const c = text.charCodeAt(b);
    if (c === COLON) {
      if (title) this.begin(T.AccTitle, this.blanks(b + 1), S.ACC_TITLE);
      else this.begin(T.AccDescr, this.blanks(b + 1), S.ACC_DESCR);
      return true;
    }
    if (c === LBRACE && !title) {
      this.begin(T.AccDescrBlockStart, this.blanks(b + 1), S.ACC_DESCR_MULTILINE);
      return true;
    }
    return false;
  }

  /** `(` (with blanks and `,`: an empty first argument) opens the arguments; `)` closes. */
  private macro(c: number): void {
    const { p } = this;
    if (c === LPAREN) {
      const e = this.spaces(p + 1);
      if (this.text.charCodeAt(e) === COMMA) this.begin(T.AttributeEmpty, e + 1, S.ATTRIBUTE);
      else this.begin(T.ArgsOpen, p + 1, S.ATTRIBUTE);
      return;
    }
    if (c === RPAREN) this.close();
    else this.error(c);
  }

  /**
   * No rule matches at `p`: a one-character error, lexing on in the same state. At a line break
   * the error is zero-width and the macro's states are left, so the line break lexes as one and
   * the parser goes on at the next line (jison had stopped at the error).
   */
  private error(c: number): void {
    const { p } = this;
    if (c !== LF) {
      this.emit(Kind.Error, p, p + 1);
      return;
    }
    this.emit(Kind.Error, p, p);
    this.stack.length = 0;
    this.state = S.INITIAL;
  }

  /** `)` in a macro state or the arguments: jison pops two states. */
  private close(): void {
    this.pop(T.ArgsClose, this.p + 1);
    this.popState();
  }

  private attribute(c: number): void {
    const { text, p } = this;
    if (c === RPAREN) {
      this.close();
      return;
    }
    if (c === COMMA) {
      if (text.charCodeAt(p + 1) === COMMA) this.emit(T.AttributeEmpty, p, p + 2);
      else this.emit(T.Comma, p, p + 1);
      return;
    }
    // `[ ]*""`, `[ ]*"`, `[ ]*\$`.
    const e = this.spaces(p);
    const d = text.charCodeAt(e);
    if (d === DQUOTE) {
      if (text.charCodeAt(e + 1) === DQUOTE) this.emit(T.AttributeEmpty, p, e + 2);
      else this.begin(T.QuoteOpen, e + 1, S.STRING);
      return;
    }
    if (d === DOLLAR) {
      this.begin(T.KeyStart, e + 1, S.STRING_KV);
      return;
    }
    // D452: a line break ends the arguments (the macro is left open, for the parser to
    // report); it lexes in INITIAL.
    if (c === LF) {
      this.stack.length = 0;
      this.state = S.INITIAL;
      return;
    }
    // `[^,)\n]+` (D452; v12's `[^,]+` ran over `)` and line breaks to the next comma).
    this.emit(T.Str, p, this.unquoted(p));
  }

  /** The end of `[^,)\n]+` from `p` (at least one past `p`). */
  private unquoted(p: number): number {
    const { text } = this;
    let j = p + 1;
    for (let c = text.charCodeAt(j); j < this.n; c = text.charCodeAt(++j)) {
      if (c === COMMA || c === RPAREN || c === LF) break;
    }
    return j;
  }

  /** `"` closes; `[^"]*` is the text, line breaks included. */
  private string(c: number): void {
    if (c === DQUOTE) this.pop(T.QuoteClose, this.p + 1);
    else this.emit(T.Str, this.p, this.find('"', this.p));
  }

  /** `=[ ]*"` opens the value (jison pops `string_kv_key` and begins `string_kv_value`). */
  private stringKvKey(c: number): void {
    const { p } = this;
    const e = c === EQUALS ? this.spaces(p + 1) : p;
    if (c === EQUALS && this.text.charCodeAt(e) === DQUOTE) {
      this.emit(T.KeyEquals, p, e + 1);
      this.state = S.STRING_KV_VALUE;
      return;
    }
    this.error(c);
  }

  /** `[^"]+` is the value; `"` closes it and the named argument (two pops). */
  private stringKvValue(c: number): void {
    if (c === DQUOTE) {
      this.pop(T.ValueClose, this.p + 1);
      this.popState();
    } else this.emit(T.StrValue, this.p, this.find('"', this.p));
  }

  /** `}` closes; `[^\}]*` is the text, line breaks included. */
  private accDescrMultiline(c: number): void {
    if (c === RBRACE) this.pop(T.AccDescrBlockEnd, this.p + 1);
    else this.emit(T.AccDescrBlockValue, this.p, this.find('}', this.p));
  }
}
