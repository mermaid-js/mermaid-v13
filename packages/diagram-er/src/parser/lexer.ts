/**
 * ER lexer: a state machine mirroring the start conditions of v12's `erDiagram.jison`
 * (DESIGN §4.3), checked token by token against it (the conformance lexer-parity gate).
 *
 * It lexes the text v12 lexed ({@link sourceView}: comments and directives cut out, CR as LF,
 * `encodeEntities` applied, a `\n` appended) and maps each token back to its range in the
 * source, which is never rewritten. Comments and directives are trivia tokens with their own
 * ranges, in source order.
 *
 * jison's matching is reproduced as it runs, not as the grammar reads:
 * - the rules of a state are tried in order and the first match wins (no longest match);
 * - every rule is case-insensitive (`%options case-insensitive`), and keyword literals that end
 *   in a word character carry a trailing `\b`;
 * - a rule's `\b` at the token start always holds before a word character (jison matches the
 *   rest of the input, so there is no character before it);
 * - when the input runs out, jison tries the current state's rules once more on the empty
 *   string: the initial state then yields `EOF`, the `accTitle`/`accDescr` states an empty value.
 *
 * An unmatched character (only possible after `style`/`classDef`) is an `Error` token, and
 * lexing carries on (for recovery). Every scan is linear in the text it consumes (R-PARSE-7):
 * the rules that look ahead to the end of a line (`.*direction…`, `…~…~…`) or to a closing
 * quote read cached results.
 */
import {
  APOSTROPHE,
  ASCII_MAX,
  BACKSLASH,
  BACKTICK,
  COLON,
  COMMA,
  CR,
  DASH,
  DOT,
  DQUOTE,
  HASH,
  PERCENT,
  PIPE,
  RBRACE,
  SEMI,
  isDigit,
  isLetter,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LF,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { TokenStream } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { sourceView } from './source.ts';
import type { SourceView } from './source.ts';
import { T } from './tokens.ts';

/** Vertical tab and backspace: ENTITY_NAME leaves them out. */
const VT = 0x0b;
const BS = 0x08;

// Start conditions of erDiagram.jison.
const S = {
  INITIAL: 0,
  block: 1,
  blockBq: 2,
  accTitle: 3,
  accDescr: 4,
  accDescrMultiline: 5,
  style: 6,
} as const;

/** No token: the rule only skips text or changes state. */
const SKIP = -1;

interface Rule {
  /** The characters a match can start with (both cases), or null for any. */
  first: string | null;
  /** The end of the match at `i`, or -1. */
  match(lx: Lexer, i: number): number;
  kind: number;
  /** The state to begin after the match. */
  begin?: number;
}

const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** `word` at `i`, ignoring ASCII case; with `\b` after it when `boundary`. */
function lit(
  word: string,
  kind: number,
  boundary = isWord(word.charCodeAt(word.length - 1))
): Rule {
  const codes = Array.from(word, (ch) => lower(ch.charCodeAt(0)));
  const head = word[0] ?? '';
  return {
    first: head.toLowerCase() + head.toUpperCase(),
    kind,
    match: (lx, i) => {
      const t = lx.text;
      for (let k = 0; k < codes.length; k++) if (lower(t.charCodeAt(i + k)) !== codes[k]) return -1;
      const end = i + codes.length;
      return boundary && isWord(t.charCodeAt(end)) ? -1 : end;
    },
  };
}

/** `prefix\s*mark\s*`: the `accTitle:` / `accDescr:` / `accDescr {` openers. */
function opener(prefix: string, mark: number, kind: number, begin: number): Rule {
  const word = lit(prefix, kind, false);
  return {
    first: word.first,
    kind,
    begin,
    match: (lx, i) => {
      let j = word.match(lx, i);
      if (j < 0) return -1;
      j = lx.spaces(j);
      return lx.text.charCodeAt(j) === mark ? lx.spaces(j + 1) : -1;
    },
  };
}

/** UNICODE_TEXT `([^\x00-\x7F]|\w|-|\*|\.)+`. */
const isUnicodeText = (c: number) => c > 127 || isWord(c) || c === 45 || c === 42 || c === 46;
/** STYLE_TEXT `([^\x00-\x7F]|\w|-|\*)+`. */
const isStyleText = (c: number) => c > 127 || isWord(c) || c === 45 || c === 42;
/**
 * The first character of a block ATTRIBUTE_WORD, `[\*A-Za-z_\u00C0-\uFFFF]`. Case-insensitive
 * matching also lets in U+00B5 (its upper case, U+039C, is in the range).
 */
const isAttrStart = (c: number) => c >= 0xc0 || isLetter(c) || c === 42 || c === 95 || c === 0xb5;
/** The rest of an ATTRIBUTE_WORD, `[A-Za-z0-9\-\_\[\]\(\)\.,\u00C0-\uFFFF\*]`. */
const ATTR_MARKS = '-_[]().,*';
const isAttrPart = (c: number) =>
  c >= 0xc0 ||
  isLetter(c) ||
  isDigit(c) ||
  c === 0xb5 ||
  (c < 128 && ATTR_MARKS.includes(String.fromCharCode(c)));

function run(pred: (c: number) => boolean, kind: number, first: string | null = null): Rule {
  return {
    first,
    kind,
    match: (lx, i) => {
      const t = lx.text;
      let j = i;
      while (j < t.length && pred(t.charCodeAt(j))) j++;
      return j > i ? j : -1;
    },
  };
}

const DIGITS = '0123456789';
const DIRECTIONS = ['tb', 'bt', 'rl', 'lr'];
const DIRECTION_KINDS = [T.DirectionTB, T.DirectionBT, T.DirectionRL, T.DirectionLR];

/** The initial state's rules, in jison's order (rule numbers of the compiled lexer). */
const INITIAL_RULES: readonly Rule[] = [
  opener('accTitle', 58, T.AccTitle, S.accTitle), // 0
  opener('accDescr', 58, T.AccDescr, S.accDescr), // 2
  opener('accDescr', 123, SKIP, S.accDescrMultiline), // 4
  // 7–10 `.*direction\s+TB[^\n]*` …: anything earlier on the line goes into the token.
  ...DIRECTION_KINDS.map(
    (kind, d): Rule => ({ first: null, kind, match: (lx, i) => lx.direction(i, d) })
  ),
  run((c) => c === 32 || c === 9 || c === 13, SKIP, ' \t\r'), // 11
  run((c) => c === LF, Kind.Newline, '\n'), // 12
  { first: '"', kind: T.EntityName, match: (lx, i) => lx.entityName(i) }, // 13
  { first: '"', kind: T.Word, match: (lx, i) => lx.quoted(i) }, // 14
  lit('erDiagram', T.ErDiagram), // 15
  { ...lit('{', T.BlockStart), begin: S.block }, // 16
  lit('#', T.Brkt), // 17, 18
  lit(',', T.Comma), // 19
  lit(':::', T.StyleSeparator), // 20
  lit(':', T.Colon), // 21
  lit('[', T.Sqs), // 33
  lit(']', T.Sqe), // 34
  { ...lit('style', T.Style), begin: S.style }, // 35
  { ...lit('classDef', T.ClassDef), begin: S.style }, // 41
  lit('class', T.Class), // 42
  lit('subgraph', T.Subgraph), // 43
  { first: 'eE', kind: T.End, match: (lx, i) => (END.match(lx, i) < 0 ? -1 : lx.spaces(i + 3)) }, // 44
  lit('one or zero', T.ZeroOrOne), // 45
  lit('one or more', T.OneOrMore), // 46
  lit('one or many', T.OneOrMore), // 47
  lit('1+', T.OneOrMore), // 48
  lit('|o', T.ZeroOrOne), // 49
  lit('zero or one', T.ZeroOrOne), // 50
  lit('zero or more', T.ZeroOrMore), // 51
  lit('zero or many', T.ZeroOrMore), // 52
  lit('0+', T.ZeroOrMore), // 53
  lit('}o', T.ZeroOrMore), // 54
  lit('many(0)', T.ZeroOrMore), // 55
  lit('many(1)', T.OneOrMore), // 56
  lit('many', T.ZeroOrMore), // 57
  lit('}|', T.OneOrMore), // 58
  lit('one', T.OnlyOne), // 59
  lit('only one', T.OnlyOne), // 60
  { first: DIGITS, kind: T.DecimalNum, match: (lx, i) => lx.decimal(i) }, // 61
  // 62, 63 `1(?=\s+[A-Za-z_"'])`, `1(?=\s+[0-9])`
  { first: '1', kind: T.OnlyOne, match: (lx, i) => (lx.oneBeforeWord(i) ? i + 1 : -1) },
  // 64 `1(?=(--|\.\.|\.-|-\.))`
  { first: '1', kind: T.OnlyOne, match: (lx, i) => (lx.oneBeforeLink(i) ? i + 1 : -1) },
  lit('1', T.EntityOne), // 65
  run(isDigit, T.Num, DIGITS), // 66
  lit('||', T.OnlyOne), // 67
  lit('o|', T.ZeroOrOne), // 68
  lit('o{', T.ZeroOrMore), // 69
  lit('|{', T.OneOrMore), // 70
  { first: 'uU', kind: T.MdParent, match: (lx, i) => (lx.beforeLink(i + 1) ? i + 1 : -1) }, // 71
  lit('..', T.NonIdentifying), // 72
  lit('--', T.Identifying), // 73
  lit('to', T.Identifying), // 74
  lit('optionally to', T.NonIdentifying), // 75
  lit('.-', T.NonIdentifying), // 76
  lit('-.', T.NonIdentifying), // 77
  run(isUnicodeText, T.UnicodeText), // 80
  { first: null, kind: T.Char, match: (lx, i) => (isLineEnd(lx.text.charCodeAt(i)) ? -1 : i + 1) }, // 81
];

const END = lit('end', T.End);

/** Per ASCII code, the initial rules that can match there, in order; the last entry: the rest. */
const INITIAL_BY_CHAR: readonly (readonly Rule[])[] = /* @__PURE__ */ (() => {
  const out: Rule[][] = [];
  for (let c = 0; c <= 128; c++) {
    const ch = c < 128 ? String.fromCharCode(c) : '';
    out.push(INITIAL_RULES.filter((r) => r.first === null || (ch !== '' && r.first.includes(ch))));
  }
  return out;
})();

/** One lex of one view. Holds the scan caches, so it is created per lex. */
class Lexer {
  readonly out = new TokenWriter(64);
  private readonly n: number;
  private readonly stack: number[] = [S.INITIAL];
  // `.*direction\s+XX[^\n]*`: for the line part [dirFrom, dirLineEnd), the start and match end
  // of the last valid occurrence per direction (-1: none).
  private dirFrom = -1;
  private dirLineEnd = -1;
  private readonly dirLast = [-1, -1, -1, -1];
  private readonly dirEnd = [0, 0, 0, 0];
  // Cached forward searches: valid for queries in [from, at] (at = n when there is none).
  private quoteFrom = -1;
  private quoteAt = -1;
  private tildeFrom = -1;
  private tildeAt = -1;
  private spaceFrom = -1;
  private spaceAt = -1;
  private lineFrom = -1;
  private lineAt = -1;
  private lastTildeLine = -1;
  private lastTilde = -1;

  constructor(readonly text: string) {
    this.n = text.length;
  }

  lex(): void {
    const t = this.text;
    let i = 0;
    for (;;) {
      const state = this.stack[this.stack.length - 1] ?? S.INITIAL;
      if (i >= this.n) {
        this.atEnd(state);
        return;
      }
      switch (state) {
        case S.INITIAL:
          i = this.initial(i);
          break;
        case S.block:
          i = this.block(i);
          break;
        case S.blockBq: {
          if (t.charCodeAt(i) === BACKTICK) {
            this.stack.pop();
            i++;
          } else {
            const e = t.indexOf('`', i);
            i = this.emit(T.AttributeWord, i, e === -1 ? this.n : e);
          }
          break;
        }
        case S.accTitle:
        case S.accDescr: {
          this.stack.pop();
          const e = t.indexOf('\n', i);
          i = this.emit(
            state === S.accTitle ? T.AccTitleValue : T.AccDescrValue,
            i,
            e === -1 ? this.n : e
          );
          break;
        }
        case S.accDescrMultiline: {
          if (t.charCodeAt(i) === RBRACE) {
            this.stack.pop();
            i++;
          } else {
            const e = t.indexOf('}', i);
            i = this.emit(T.AccDescrMultilineValue, i, e === -1 ? this.n : e);
          }
          break;
        }
        default:
          i = this.style(i);
      }
    }
  }

  /** jison's last match attempt, on the empty rest of the input. */
  private atEnd(state: number): void {
    const n = this.n;
    if (state === S.INITIAL) this.emit(T.Eof, n, n);
    else if (state === S.accTitle) this.emit(T.AccTitleValue, n, n);
    else if (state === S.accDescr) this.emit(T.AccDescrValue, n, n);
    else if (state === S.accDescrMultiline) this.emit(T.AccDescrMultilineValue, n, n);
  }

  private emit(kind: number, start: number, end: number): number {
    if (kind !== SKIP) this.out.push(kind, start, end);
    return end;
  }

  private initial(i: number): number {
    const c = this.text.charCodeAt(i);
    const rules = INITIAL_BY_CHAR[c < ASCII_MAX + 1 ? c : 128] ?? [];
    for (const r of rules) {
      const end = r.match(this, i);
      if (end < 0) continue;
      if (r.begin !== undefined) this.stack.push(r.begin);
      return this.emit(r.kind, i, end);
    }
    return i + 1; // unreachable: `.` and UNICODE_TEXT cover every character
  }

  private block(i: number): number {
    const t = this.text;
    const c = t.charCodeAt(i);
    if (isSpace(c)) return this.spaces(i); // `\s+`
    // `\b((?:PK)|(?:FK)|(?:UK))\b`
    const c0 = lower(c);
    if (
      (c0 === 112 || c0 === 102 || c0 === 117) &&
      lower(t.charCodeAt(i + 1)) === 107 &&
      !isWord(t.charCodeAt(i + 2))
    ) {
      return this.emit(T.AttributeKey, i, i + 2);
    }
    const generic = this.generic(i);
    if (generic >= 0) return this.emit(T.AttributeWord, i, generic);
    if (isAttrStart(c)) {
      let j = i + 1;
      while (j < this.n && isAttrPart(t.charCodeAt(j))) j++;
      return this.emit(T.AttributeWord, i, j);
    }
    if (c === BACKTICK) {
      this.stack.push(S.blockBq);
      return i + 1;
    }
    if (c === DQUOTE) {
      const e = this.quoted(i);
      if (e >= 0) return this.emit(T.AttributeComment, i, e);
    }
    if (c === RBRACE) {
      this.stack.pop();
      return this.emit(T.BlockStop, i, i + 1);
    }
    return this.emit(T.Char, i, i + 1); // `.`: no line end gets here, `\s+` took it
  }

  private style(i: number): number {
    const t = this.text;
    const c = t.charCodeAt(i);
    if (c === LF) {
      this.stack.pop();
      let j = i + 1;
      while (t.charCodeAt(j) === LF) j++;
      return this.emit(Kind.Newline, i, j);
    }
    // `\s+` takes line breaks after a blank too, and the state goes on.
    if (isSpace(c)) return this.spaces(i);
    if (c === COLON) return this.emit(T.Colon, i, i + 1);
    if (c === COMMA) return this.emit(T.Comma, i, i + 1);
    if (c === HASH) return this.emit(T.Brkt, i, i + 1);
    if (isStyleText(c)) {
      let j = i + 1;
      while (j < this.n && isStyleText(t.charCodeAt(j))) j++;
      return this.emit(T.StyleText, i, j);
    }
    if (c === SEMI) return this.emit(T.Semi, i, i + 1);
    return this.emit(Kind.Error, i, i + 1);
  }

  /** The end of `\s*` from `i`. */
  spaces(i: number): number {
    let j = i;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `"[^"%\r\n\v\b\\]+"` at `i`, or -1. */
  entityName(i: number): number {
    const t = this.text;
    let j = i + 1;
    for (; j < this.n; j++) {
      const c = t.charCodeAt(j);
      if (
        c === DQUOTE ||
        c === PERCENT ||
        c === CR ||
        c === LF ||
        c === VT ||
        c === BS ||
        c === BACKSLASH
      )
        break;
    }
    return j > i + 1 && t.charCodeAt(j) === DQUOTE ? j + 1 : -1;
  }

  /** `"[^"]*"` at `i`, or -1. */
  quoted(i: number): number {
    if (!(this.quoteFrom <= i + 1 && i + 1 <= this.quoteAt)) {
      this.quoteFrom = i + 1;
      const q = this.text.indexOf('"', i + 1);
      this.quoteAt = q === -1 ? this.n : q;
    }
    return this.quoteAt < this.n ? this.quoteAt + 1 : -1;
  }

  /** `[0-9]+\.[0-9]+` at `i`, or -1. */
  decimal(i: number): number {
    const t = this.text;
    let j = i;
    while (isDigit(t.charCodeAt(j))) j++;
    if (j === i || t.charCodeAt(j) !== DOT || !isDigit(t.charCodeAt(j + 1))) return -1;
    j++;
    while (isDigit(t.charCodeAt(j))) j++;
    return j;
  }

  /** After the `1` at `i`: `\s+[A-Za-z_"']` or `\s+[0-9]`. */
  oneBeforeWord(i: number): boolean {
    const j = this.spaces(i + 1);
    if (j === i + 1) return false;
    const c = this.text.charCodeAt(j);
    return isWord(c) || c === DQUOTE || c === APOSTROPHE;
  }

  /** After the `1` at `i`: `--`, `..`, `.-` or `-.`. */
  oneBeforeLink(i: number): boolean {
    const a = this.text.charCodeAt(i + 1);
    const b = this.text.charCodeAt(i + 2);
    return (a === DASH || a === DOT) && (b === DASH || b === DOT);
  }

  /** `[\.\-\|]` at `i` (MD_PARENT's lookahead). */
  beforeLink(i: number): boolean {
    const c = this.text.charCodeAt(i);
    return c === DOT || c === DASH || c === PIPE;
  }

  /** `.*direction\s+XX[^\n]*` (XX the `d`th of TB, BT, RL, LR) at `i`: its end, or -1. */
  direction(i: number, d: number): number {
    if (!(this.dirFrom <= i && i < this.dirLineEnd)) this.directions(i);
    return (this.dirLast[d] ?? -1) >= i ? (this.dirEnd[d] ?? -1) : -1;
  }

  /** Find the last valid `direction` of each kind from `i` to the end of its line. */
  private directions(i: number): void {
    const t = this.text;
    let le = i;
    while (le < this.n && !isLineEnd(t.charCodeAt(le))) le++;
    this.dirFrom = i;
    this.dirLineEnd = le;
    this.dirLast.fill(-1);
    for (let k = i; k + 9 <= le; k++) {
      if (lower(t.charCodeAt(k)) !== 100 || DIRECTION.match(this, k) < 0) continue;
      const w = this.spaces(k + 9);
      if (w === k + 9) continue;
      const pair = String.fromCharCode(lower(t.charCodeAt(w)), lower(t.charCodeAt(w + 1)));
      const dir = DIRECTIONS.indexOf(pair);
      if (dir < 0) continue;
      const lf = t.indexOf('\n', w + 2);
      this.dirLast[dir] = k;
      this.dirEnd[dir] = lf === -1 ? this.n : lf;
    }
  }

  /**
   * `([^\s]*)[~].*[~]([^\s]*)` at `i` (block attribute types such as `type~T~`): its end, or
   * -1. The second `~` is the last one on the line; the first is any `~` before it in the run
   * of non-blanks at `i`.
   */
  private generic(i: number): number {
    const first = this.nextTilde(i);
    if (first >= this.nextSpace(i)) return -1;
    const last = this.lastTildeOnLine(i);
    return last > first ? this.nextSpace(last + 1) : -1;
  }

  private nextTilde(i: number): number {
    if (!(this.tildeFrom <= i && i <= this.tildeAt)) {
      this.tildeFrom = i;
      const k = this.text.indexOf('~', i);
      this.tildeAt = k === -1 ? this.n : k;
    }
    return this.tildeAt;
  }

  private nextSpace(i: number): number {
    if (!(this.spaceFrom <= i && i <= this.spaceAt)) {
      this.spaceFrom = i;
      this.spaceAt = this.scanTo(i, isSpace);
    }
    return this.spaceAt;
  }

  private lastTildeOnLine(i: number): number {
    if (!(this.lineFrom <= i && i <= this.lineAt)) {
      this.lineFrom = i;
      this.lineAt = this.scanTo(i, isLineEnd);
      this.lastTildeLine = -1;
    }
    if (this.lastTildeLine !== this.lineAt) {
      this.lastTildeLine = this.lineAt;
      this.lastTilde = this.lineAt > 0 ? this.text.lastIndexOf('~', this.lineAt - 1) : -1;
    }
    return this.lastTilde >= i ? this.lastTilde : -1;
  }

  private scanTo(i: number, pred: (c: number) => boolean): number {
    let j = i;
    while (j < this.n && !pred(this.text.charCodeAt(j))) j++;
    return j;
  }
}

const DIRECTION = lit('direction', T.DirectionTB, false);

export interface LexResult {
  /** Tokens with source ranges, trivia included, ending in `Kind.EOF`. */
  tokens: TokenStream;
  /** Per token, its range in `view.text` (trivia: -1). */
  textStart: Int32Array;
  textEnd: Int32Array;
  view: SourceView;
}

/** Lex an ER source (front matter and directives located by core's preprocess). */
export function lex(src: string, pre: PreprocessResult = preprocess(src)): LexResult {
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const lexer = new Lexer(view.text);
  lexer.lex();
  const raw = lexer.out.finish(view.text);
  const count = raw.length - 1 + view.trivia.length;
  const out = new TokenWriter(count + 1);
  const textStart = new Int32Array(count + 1).fill(-1);
  const textEnd = new Int32Array(count + 1).fill(-1);
  let k = 0;
  let n = 0;
  for (let j = 0; j < raw.length - 1; j++) {
    const a = raw.start[j] ?? 0;
    const b = raw.end[j] ?? 0;
    const start = view.start(a);
    const end = b > a ? view.end(b) : start;
    for (; k < view.trivia.length && (view.trivia[k]?.start ?? 0) < start; k++, n++) {
      const tr = view.trivia[k];
      if (tr) out.push(tr.kind === 'comment' ? Kind.Comment : Kind.Directive, tr.start, tr.end);
    }
    textStart[n] = a;
    textEnd[n] = b;
    out.push(raw.kind[j] ?? Kind.Error, start, end);
    n++;
  }
  for (; k < view.trivia.length; k++) {
    const tr = view.trivia[k];
    if (tr) out.push(tr.kind === 'comment' ? Kind.Comment : Kind.Directive, tr.start, tr.end);
  }
  return { tokens: out.finish(src), textStart, textEnd, view };
}
