/**
 * The lexer rules of v12's `classDiagram.jison`, one entry per jison rule and in jison's order
 * (index = jison rule number), with the rule lists of each start condition. jison tries a
 * state's rules in order and the first that matches wins (no longest match); literals that end
 * in a word character carry a trailing `\b`. Each matcher returns the end of its match at `p`,
 * or -1, in time linear in what it reads (R-PARSE-7).
 */
import {
  BACKTICK,
  COLON,
  COMMA,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  GT,
  HASH,
  isDigit,
  isSpace,
  isUnicodeLetter,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  LOWER_O,
  LPAREN,
  LT,
  PERCENT,
  PIPE,
  PLUS,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  STAR,
  TILDE,
} from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/** Start conditions of classDiagram.jison (`struct` and `href` are never entered). */
export const S = {
  INITIAL: 0,
  string: 1,
  bqstring: 2,
  generic: 3,
  callback_name: 4,
  callback_args: 5,
  acc_title: 6,
  acc_descr: 7,
  acc_descr_multiline: 8,
  class: 9,
  classBody: 10,
  namespace: 11,
  namespaceBody: 12,
} as const;

/** What a rule does to the state stack. */
export const A = {
  none: 0,
  begin: 1,
  pop: 2,
  /** Pop twice (`<class>}`). */
  pop2: 3,
  /** Pop and give the match back (`this.less(0)`). */
  popLess: 4,
  /** Pop, then begin {@link Rule.state}. */
  popBegin: 5,
} as const;

/** Per-lex memo the `direction` matchers use to stay linear; one per lex. */
export interface Scan {
  readonly text: string;
  /** For each of the four direction rules, the line end it last failed on (else -1). */
  readonly dirFailed: Int32Array;
  /** The next `direction` at or after a position, cached (-2: not looked up yet). */
  dirNext: number;
  /** The next line end (as regex `.` sees it) at or after a position, cached. */
  lineEndAt: number;
}

export interface Rule {
  /** End of the match at `p`, or -1. */
  readonly match: (x: Scan, p: number) => number;
  /** The token kind returned, or -1 for none. */
  readonly kind: number;
  readonly action: number;
  readonly state: number;
}

const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;
const isLineSep = (c: number) => c === LF || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR;

type Matcher = (x: Scan, p: number) => number;
/** The ASCII characters a matcher can start a match with; a matcher absent here may start with any. */
const FIRST = new WeakMap<Matcher, { chars: string | undefined; blank: boolean }>();
const startsWith = (m: Matcher, chars: string | undefined, blank = false): Matcher => {
  FIRST.set(m, { chars, blank });
  return m;
};

/** End of the literal `word` at `p` (with jison's trailing `\b` when it ends in `\w`), or -1. */
const lit = (word: string) =>
  startsWith((x, p) => {
    if (!x.text.startsWith(word, p)) return -1;
    const end = p + word.length;
    return isWord(word.charCodeAt(word.length - 1)) && isWord(x.text.charCodeAt(end)) ? -1 : end;
  }, word.charAt(0));
/** One character code. */
const ch = (code: number) =>
  startsWith((x, p) => (x.text.charCodeAt(p) === code ? p + 1 : -1), String.fromCharCode(code));
/** `[^stop]*` (`+` with `min` 1): up to the next `stop`. */
const until =
  (stop: string, min = 0) =>
  (x: Scan, p: number): number => {
    const i = x.text.indexOf(stop, p);
    const end = i < 0 ? x.text.length : i;
    return end - p >= min ? end : -1;
  };
/** `\s*` then `rest` (greedy `\s*` gives nothing back: `rest` never starts with a blank). */
const blanksThen = (rest: Matcher) =>
  startsWith(
    (x, p) => {
      let i = p;
      while (isSpace(x.text.charCodeAt(i))) i++;
      return rest(x, i);
    },
    FIRST.get(rest)?.chars,
    true
  );
/** `\s*(\r?\n)+`: blanks through the last line feed among them. */
const newlines = (x: Scan, p: number): number => {
  let end = -1;
  for (let i = p; isSpace(x.text.charCodeAt(i)); i++) if (x.text.charCodeAt(i) === LF) end = i + 1;
  return end;
};
/** `\s+`. */
const blanks = (x: Scan, p: number): number => {
  let i = p;
  while (isSpace(x.text.charCodeAt(i))) i++;
  return i > p ? i : -1;
};
/** `literal\s*`. */
const litBlanks = (word: string, close: number) =>
  startsWith((x, p) => {
    if (!x.text.startsWith(word, p)) return -1;
    let i = p + word.length;
    while (isSpace(x.text.charCodeAt(i))) i++;
    if (x.text.charCodeAt(i) !== close) return -1;
    i++;
    while (isSpace(x.text.charCodeAt(i))) i++;
    return i;
  }, word.charAt(0));
const end = (x: Scan, p: number): number => (p >= x.text.length ? p : -1);

/** Next line end as regex `.` sees it, at or after `p` (memoised: `p` never decreases). */
function lineEndFrom(x: Scan, p: number): number {
  // Cached from an earlier offset: no line end lies between it and `p`.
  if (x.lineEndAt >= p) return x.lineEndAt;
  let i = p;
  const t = x.text;
  while (i < t.length && !isLineSep(t.charCodeAt(i))) i++;
  x.lineEndAt = i;
  return i;
}

const DIRECTIONS = ['TB', 'BT', 'RL', 'LR'];
const DIRECTION = 'direction';

/**
 * `.*direction\s+XX[^\n]*`: the last `direction` on the line from `p` that is followed by
 * blanks and `XX` (greedy `.*`), through the next line feed. Once a rule fails on a line it
 * fails from every later offset on it, which keeps the scan linear.
 */
const direction = (d: number) => (x: Scan, p: number) => {
  const t = x.text;
  const le = lineEndFrom(x, p);
  if (x.dirFailed[d] === le) return -1;
  if (x.dirNext !== -1 && x.dirNext < p) x.dirNext = t.indexOf(DIRECTION, p);
  const dd = DIRECTIONS[d] ?? '';
  if (x.dirNext !== -1 && x.dirNext < le) {
    for (
      let k = t.lastIndexOf(DIRECTION, le - 1);
      k >= p;
      k = k > 0 ? t.lastIndexOf(DIRECTION, k - 1) : -1
    ) {
      if (k + DIRECTION.length > le) continue;
      let i = k + DIRECTION.length;
      if (!isSpace(t.charCodeAt(i))) continue;
      while (isSpace(t.charCodeAt(i))) i++;
      if (!t.startsWith(dd, i)) continue;
      const nl = t.indexOf('\n', i + 2);
      return nl < 0 ? t.length : nl;
    }
  }
  x.dirFailed[d] = le;
  return -1;
};

/** `:{1}[^:\n;]+`. */
const label = (x: Scan, p: number) => {
  const t = x.text;
  if (t.charCodeAt(p) !== COLON) return -1;
  let i = p + 1;
  for (let c = t.charCodeAt(i); i < t.length && c !== COLON && c !== LF && c !== SEMI; ) {
    c = t.charCodeAt(++i);
  }
  return i > p + 1 ? i : -1;
};
/** `[^{}\n]*`. */
const member = (x: Scan, p: number) => {
  const t = x.text;
  let i = p;
  for (let c = t.charCodeAt(i); i < t.length && c !== LBRACE && c !== RBRACE && c !== LF; ) {
    c = t.charCodeAt(++i);
  }
  return i;
};
const word = (x: Scan, p: number) => {
  let i = p;
  while (isWord(x.text.charCodeAt(i))) i++;
  return i > p ? i : -1;
};
const digits = (x: Scan, p: number) => {
  let i = p;
  while (isDigit(x.text.charCodeAt(i))) i++;
  return i > p ? i : -1;
};
/** jison's PUNCTUATION class (its `,-.` is a range: comma, dash and dot). */
const PUNCTUATION_CHARS = '!"#$%&\'*+,-.`?\\/';
const punctuation = (x: Scan, p: number) =>
  PUNCTUATION_CHARS.includes(x.text[p] ?? '\0') ? p + 1 : -1;
const unicode = (x: Scan, p: number) => (isUnicodeLetter(x.text.charCodeAt(p)) ? p + 1 : -1);
const space = (x: Scan, p: number) => (isSpace(x.text.charCodeAt(p)) ? p + 1 : -1);
/** `\s*o\b`. */
const aggregation = blanksThen((x, p) =>
  x.text.charCodeAt(p) === LOWER_O && !isWord(x.text.charCodeAt(p + 1)) ? p + 1 : -1
);
const two = (a: number, b: number) =>
  startsWith(
    (x, p) => (x.text.charCodeAt(p) === a && x.text.charCodeAt(p + 1) === b ? p + 2 : -1),
    String.fromCharCode(a)
  );
/** `\([\s]*\)`. */
const emptyArgs = (x: Scan, p: number) => {
  if (x.text.charCodeAt(p) !== LPAREN) return -1;
  let i = p + 1;
  while (isSpace(x.text.charCodeAt(i))) i++;
  return x.text.charCodeAt(i) === RPAREN ? i + 1 : -1;
};
/** `call[\s]+`. */
const call = (x: Scan, p: number) => {
  if (!x.text.startsWith('call', p)) return -1;
  const e = blanks(x, p + 4);
  return e;
};
/** `%%(?!\{)*[^\n]*(\r?\n?)+` (the quantified lookahead matches empty): to the end of the line and every line feed after it. */
const comment = (x: Scan, p: number) => {
  if (x.text.charCodeAt(p) !== PERCENT || x.text.charCodeAt(p + 1) !== PERCENT) return -1;
  let i = x.text.indexOf('\n', p);
  if (i < 0) return x.text.length;
  while (x.text.charCodeAt(i) === LF) i++;
  return i;
};

const r = (match: Matcher, kind = -1, action: number = A.none, state = 0): Rule => ({
  match,
  kind,
  action,
  state,
});

// prettier-ignore
/** jison rules 0–98, in order. */
export const RULES: readonly Rule[] = [
  r(direction(0), T.DirectionTB), r(direction(1), T.DirectionBT),
  r(direction(2), T.DirectionRL), r(direction(3), T.DirectionLR),
  r(comment, Kind.Comment), r(comment, Kind.Comment),
  r(litBlanks('accTitle', COLON), T.AccTitle, A.begin, S.acc_title),
  r(until('\n'), T.AccTitleValue, A.pop),
  r(litBlanks('accDescr', COLON), T.AccDescr, A.begin, S.acc_descr),
  r(until('\n'), T.AccDescrValue, A.pop),
  r(litBlanks('accDescr', LBRACE), -1, A.begin, S.acc_descr_multiline),
  r(ch(RBRACE), -1, A.pop),
  r(until('}'), T.AccDescrMultilineValue),
  // 13
  r(newlines, Kind.Newline), r(blanks),
  r(lit('classDiagram-v2'), T.ClassDiagram), r(lit('classDiagram'), T.ClassDiagram),
  r(lit('[*]'), T.EdgeState),
  r(call, -1, A.begin, S.callback_name),
  r(emptyArgs, -1, A.pop), r(ch(LPAREN), -1, A.popBegin, S.callback_args),
  r(until('('), T.CallbackName),
  r(ch(RPAREN), -1, A.pop), r(until(')'), T.CallbackArgs),
  // 24
  r(ch(DQUOTE), -1, A.pop), r(until('"'), T.Str), r(ch(DQUOTE), -1, A.begin, S.string),
  r(lit('style'), T.Style), r(lit('classDef'), T.ClassDef),
  r(lit('namespace'), T.Namespace, A.begin, S.namespace),
  // 30: namespace
  r(newlines, Kind.Newline, A.pop), r(blanks),
  r(ch(LBRACE), T.StructStart, A.begin, S.namespaceBody), r(ch(RBRACE), -1, A.popLess),
  // 34: namespace-body
  r(ch(RBRACE), T.StructStop, A.pop), r(end, T.EofInStruct),
  r(newlines, Kind.Newline), r(blanks), r(lit('[*]'), T.EdgeState),
  // 39
  r(lit('class'), T.Class, A.begin, S.class),
  r(newlines, Kind.Newline, A.pop), r(blanks),
  r(ch(RBRACE), T.StructStop, A.pop2), r(ch(LBRACE), T.StructStart, A.begin, S.classBody),
  // 44: class-body
  r(ch(RBRACE), T.StructStop, A.pop), r(end, T.EofInStruct), r(lit('[*]'), T.EdgeState),
  r(ch(LBRACE), T.OpenInStruct), r(ch(LF)), r(member, T.Member),
  // 50
  r(lit('cssClass'), T.CssClass), r(lit('callback'), T.Callback), r(lit('link'), T.Link),
  r(lit('click'), T.Click), r(lit('note for'), T.NoteFor), r(lit('note'), T.Note),
  r(two(LT, LT), T.AnnotationStart), r(two(GT, GT), T.AnnotationEnd), r(lit('href'), T.Href),
  // 59
  r(ch(TILDE), -1, A.pop), r(until('~'), T.GenericType), r(ch(TILDE), -1, A.begin, S.generic),
  r(ch(BACKTICK), -1, A.pop), r(until('`', 1), T.BquoteStr),
  r(ch(BACKTICK), -1, A.begin, S.bqstring),
  // 65
  r(lit('_self'), T.LinkTarget), r(lit('_blank'), T.LinkTarget),
  r(lit('_parent'), T.LinkTarget), r(lit('_top'), T.LinkTarget),
  // 69
  r(blanksThen(two(LT, PIPE)), T.Extension), r(blanksThen(two(PIPE, GT)), T.Extension),
  r(blanksThen(ch(GT)), T.Dependency), r(blanksThen(ch(LT)), T.Dependency),
  r(blanksThen(ch(STAR)), T.Composition), r(aggregation, T.Aggregation),
  r(blanksThen(two(LPAREN, RPAREN)), T.Lollipop),
  r(two(DASH, DASH), T.Line), r(two(DOT, DOT), T.DottedLine),
  r(label, T.Label), r(lit(':::'), T.StyleSeparator),
  // 80
  r(ch(DASH), T.Minus), r(ch(DOT), T.Dot), r(ch(PLUS), T.Plus), r(ch(COLON), T.Colon),
  r(ch(COMMA), T.Comma), r(ch(HASH), T.Brkt), r(ch(HASH), T.Brkt), r(ch(PERCENT), T.Pct),
  r(ch(EQUALS), T.Equals), r(ch(EQUALS), T.Equals), r(word, T.Alpha),
  r(ch(LBRACKET), T.SQS), r(ch(RBRACKET), T.SQE), r(punctuation, T.Punctuation),
  r(digits, T.Num), r(unicode, T.UnicodeText), r(space, T.Space), r(space, T.Space),
  r(end, T.Eof),
];

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** The `<*>` rules. */
const ALL = [26, ...range(50, 58), 61, ...range(64, 82), ...range(87, 96), 98];
const withAll = (own: number[]) => [...new Set([...own, ...ALL])].sort((a, b) => a - b);

/** Each start condition's rules, in the order jison tries them. */
export const CONDITIONS: readonly (readonly number[])[] = [
  // INITIAL is inclusive: the unconditioned rules plus the INITIAL-tagged and `<*>` ones.
  withAll([...range(0, 6), 8, 10, 13, 14, 15, 16, 17, 18, 27, 28, 29, 39, ...range(83, 86), 97]),
  withAll([24, 25]),
  withAll([62, 63]),
  withAll([59, 60]),
  withAll([19, 20, 21]),
  withAll([22, 23]),
  withAll([7]),
  withAll([9]),
  withAll([11, 12]),
  withAll([40, 41, 42, 43]),
  withAll([44, 45, 46, 47, 48, 49]),
  withAll([29, 30, 31, 32, 33]),
  withAll([29, 34, 35, 36, 37, 38, 39]),
];

/** `rules` memo: per state, by the character at the offset (128: any other). */
const AT: (readonly number[] | undefined)[][] = CONDITIONS.map(() => []);

/**
 * The rules of `state` that can match where the text has `c` (its code, NaN past the end), in
 * jison's order. A rule that starts with some other character cannot match there, so the first
 * match is the one {@link CONDITIONS} gives, found without trying those.
 */
export function rulesAt(state: number, c: number): readonly number[] {
  const all = CONDITIONS[state] ?? [];
  if (Number.isNaN(c)) return all;
  const k = c < 128 ? c : 128;
  return ((AT[state] ??= [])[k] ??= all.filter((i) => canStart(RULES[i] as Rule, k)));
}

/** Whether `rule` may start a match at character `c` (below 128; 128 for a non-ASCII one). */
function canStart(rule: Rule, c: number): boolean {
  const first = FIRST.get(rule.match);
  if (first?.chars === undefined) return true;
  if (c === 128) return first.blank;
  return first.chars.includes(String.fromCharCode(c)) || (first.blank && isSpace(c));
}
