/**
 * The table-lexer family: a v12 jison lexer's rules run as they are (one {@link Rule} per jison
 * rule, in jison's order) on exactly the text v12's lexer saw ({@link V12Text}), with every
 * token mapped back to its source range (DESIGN §4.3). The source is never rewritten. Comments
 * and directives v12 removed before lexing are trivia tokens with their own ranges, in source
 * order. A diagram writes its rules, start conditions and the patterns only it has; the
 * patterns several jison lexers share are here.
 *
 * jison semantics kept: the first rule of the current start condition that matches wins (no
 * longest match); a rule without a token still writes a v13 token for its match; at the end of
 * the text the rules are tried once more (`<<EOF>>`, empty values), then lexing stops. Where
 * jison would throw, one `Error` token is written (zero-width before a line break, else one
 * code point), the lexer resets to the initial state and carries on (for recovery).
 *
 * Linear in the text (R-PARSE-7, pitfall 5): a rule scans the text it matches plus a bounded
 * look past it, and a rule that starts with a blank run and fails remembers the run's end
 * ({@link Rule.lead}), so the blanks after it fail at once.
 */
import {
  codePointEnd,
  type Hole,
  isSpace,
  isWord,
  Kind,
  type KindSet,
  kindSet,
  LBRACE,
  LF,
  PERCENT,
  type Probe,
  RBRACE,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { V12Lex, V12Text } from './v12-text.ts';

/** The text being lexed and its length (appended `\n` included). */
export interface Scan {
  readonly text: string;
  readonly n: number;
}

/** A rule's pattern: the end of the match at `p`, or -1. */
export interface Matcher {
  (x: Scan, p: number): number;
  /**
   * Whether a match can start with the character `c` (an ASCII code), for the dispatch table;
   * absent for a pattern that may match the empty string or any character.
   */
  first?: (c: number) => boolean;
}

/** What a rule does to the start-condition stack. */
export const A = {
  none: 0,
  /** `this.begin(…)` / `this.pushState(…)`. */
  begin: 1,
  /** `this.popState()`. */
  pop: 2,
  /** `this.popState(); this.begin(…)`. */
  popBegin: 3,
} as const;

export type Action = (typeof A)[keyof typeof A];

export interface Rule {
  readonly match: Matcher;
  /** The token kind written for the match (a trivia kind for the skipped comments). */
  readonly kind: number;
  readonly action: Action;
  /** The start condition `A.begin` and `A.popBegin` enter. */
  readonly state: number;
  /**
   * For a rule that starts with a blank run (`" "*` or `\s*`) and whose outcome depends only on
   * the text after it: the end of that run from `p`.
   */
  readonly lead: ((x: Scan, p: number) => number) | undefined;
}

/** One rule; `state` 0 is the initial start condition. */
export const rule = (
  match: Matcher,
  kind: number,
  action: Action = A.none,
  state = 0,
  lead?: (x: Scan, p: number) => number
): Rule => ({ match, kind, action, state, lead });

// --- Patterns -------------------------------------------------------------------------------

export const code = (x: Scan, p: number): number => x.text.charCodeAt(p);

/** ASCII lower case (jison's `case-insensitive` folds ASCII letters only). */
export const fold = (c: number): number => (c >= 0x41 && c <= 0x5a ? c + 0x20 : c);

/** End of the case-insensitive `word` (lower case) at `p`, or -1. */
export function literal(x: Scan, word: string, p: number): number {
  if (p + word.length > x.n) return -1;
  for (let k = 0; k < word.length; k++) {
    if (fold(x.text.charCodeAt(p + k)) !== word.charCodeAt(k)) return -1;
  }
  return p + word.length;
}

/** End of the run of `\s` from `p`. */
export function blanks(x: Scan, p: number): number {
  let j = p;
  while (j < x.n && isSpace(x.text.charCodeAt(j))) j++;
  return j;
}

/** The first LF at or after `p` (`[^\n]*` ends there), else the end. */
export function lineEnd(x: Scan, p: number): number {
  const e = x.text.indexOf('\n', p);
  return e === -1 ? x.n : e;
}

/** `[^c]*`: up to the next `c`, else the end. */
export function until(x: Scan, c: string, p: number): number {
  const e = x.text.indexOf(c, p);
  return e === -1 ? x.n : e;
}

/**
 * `match`, known to start only with a character `first` accepts. `match` gets the mark: pass a
 * function of its own, never one another rule uses bare.
 */
export const starting = (
  first: (c: number) => boolean,
  match: (x: Scan, p: number) => number
): Matcher => Object.assign(match, { first });

/** The first character of a case-insensitive literal (lower case). */
export const firstOf = (word: string): ((c: number) => boolean) => {
  const w = word.charCodeAt(0);
  return (c) => fold(c) === w;
};

/** A literal with jison's trailing `\b`. */
export const keyword = (word: string): Matcher =>
  starting(firstOf(word), (x, p) => {
    const e = literal(x, word, p);
    return e < 0 || isWord(code(x, e)) ? -1 : e;
  });

/** A literal with no `\b` after it. */
export const exact = (word: string): Matcher =>
  starting(firstOf(word), (x, p) => literal(x, word, p));

/** `word\s*"c"\s*` (`accTitle:`, `accDescr:`, `accDescr {`). */
export const wordThen = (word: string, c: number): Matcher =>
  starting(firstOf(word), (x, p) => {
    const e = literal(x, word, p);
    if (e < 0) return -1;
    const b = blanks(x, e);
    return code(x, b) === c ? blanks(x, b + 1) : -1;
  });

/** One character. */
export const char = (c: number): Matcher =>
  starting(
    (d) => d === c,
    (x, p) => (code(x, p) === c ? p + 1 : -1)
  );

/** A non-empty run of characters `test` accepts. */
export const run = (test: (c: number) => boolean): Matcher =>
  starting(test, (x, p) => {
    let j = p;
    while (j < x.n && test(x.text.charCodeAt(j))) j++;
    return j > p ? j : -1;
  });

const isPercent = (c: number): boolean => c === PERCENT;

/** `%%(?!\{)[^\n]*`. */
export const comment: Matcher = /* @__PURE__ */ starting(isPercent, (x, p) => {
  if (code(x, p) !== PERCENT || code(x, p + 1) !== PERCENT || code(x, p + 2) === LBRACE) return -1;
  return lineEnd(x, p + 2);
});

/** `[^\}]%%[^\n]*`: a comment that takes the character before it (a line break too). */
export const commentAfter: Matcher = /* @__PURE__ */ starting(
  (c) => c !== RBRACE,
  (x, p) => {
    if (p >= x.n || code(x, p) === RBRACE) return -1;
    if (code(x, p + 1) !== PERCENT || code(x, p + 2) !== PERCENT) return -1;
    return lineEnd(x, p + 3);
  }
);

/** `%%[^\n]*`. */
export const anyComment: Matcher = /* @__PURE__ */ starting(isPercent, (x, p) =>
  code(x, p) === PERCENT && code(x, p + 1) === PERCENT ? lineEnd(x, p + 2) : -1
);

// --- Grammar --------------------------------------------------------------------------------

/** One diagram's jison lexer, as {@link lexTable} runs it. */
export interface TableGrammar {
  /** The rules; index = jison rule number (from 0). */
  readonly rules: readonly Rule[];
  /** Rule numbers of each start condition, in order; condition 0 is the initial one. */
  readonly conditions: readonly (readonly number[])[];
  /**
   * Per start condition and ASCII character, the rules of {@link conditions} that can match at
   * a position holding that character, in the same order: a rule whose pattern starts only
   * with other characters ({@link Matcher.first}) is left out, so the first match is the same.
   * Past ASCII and at the end of the text the full list applies.
   */
  readonly dispatch: readonly (readonly (readonly number[])[])[];
  /** Start condition names by number, for the probe's lexer mode (jison's names). */
  readonly states: readonly string[];
  /**
   * Word kinds: a cursor right after one extends it (`tit¦`), so the probe's mode there is that
   * of the step that lexed it, not of the next step.
   */
  readonly words: KindSet;
}

/** The {@link TableGrammar} of these rules and start conditions (built once per diagram). */
export function tableGrammar(
  rules: readonly Rule[],
  conditions: readonly (readonly number[])[],
  states: readonly string[],
  words: readonly number[]
): TableGrammar {
  const dispatch = conditions.map((list) =>
    Array.from({ length: 128 }, (_, c) =>
      list.filter((k) => {
        const first = rules[k]?.match.first;
        return first === undefined || first(c);
      })
    )
  );
  return { rules, conditions, dispatch, states, words: kindSet(...words) };
}

/**
 * Lex a source as v12 saw it (`v12`) with the rules of `grammar`, writing v12's removed spans
 * as trivia. `onRule` is told the jison rule number of every rule that matches (dev use: the
 * rule-coverage gate). With a `probe`, the start condition at the probe's offset is recorded
 * as its mode (R-LANG-7).
 */
export function lexTable(
  src: string,
  v12: V12Text,
  grammar: TableGrammar,
  onRule?: (rule: number) => void,
  probe?: Probe
): V12Lex {
  return new TableLexer(src, v12, grammar, onRule).run(probe);
}

/** One lex. Not subclassed: a diagram's differences are all in its {@link TableGrammar}. */
class TableLexer {
  private readonly scan: Scan;
  private readonly w: TokenWriter;
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  private readonly stack: number[] = [];
  private state = 0;
  private hole = 0;
  private readonly holes: readonly Hole[];
  /** Per blank-led rule, the end of the blank run it last failed across (else -1). */
  private readonly failedTo: Int32Array;
  /** Where the last matching step ended. */
  private matchEnd = 0;

  constructor(
    private readonly src: string,
    private readonly v12: V12Text,
    private readonly g: TableGrammar,
    private readonly onRule: ((rule: number) => void) | undefined
  ) {
    this.scan = { text: v12.text, n: v12.text.length };
    this.holes = v12.holes;
    this.failedTo = new Int32Array(g.rules.length).fill(-1);
    // About one token per three characters.
    this.w = new TokenWriter(((v12.text.length / 3) | 0) + 8);
  }

  run(probe?: Probe): V12Lex {
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) this.lex();
    else this.lexProbed(probe);
    this.trivia(this.src.length + 1);
    const tokens = this.w.finish(this.src);
    this.starts.push(this.v12.length);
    this.ends.push(this.v12.length);
    return {
      tokens,
      textStart: Int32Array.from(this.starts),
      textEnd: Int32Array.from(this.ends),
      v12: this.v12,
    };
  }

  /** Every step, to the one at the end of the text. */
  private lex(): void {
    const { n } = this.scan;
    let p = 0;
    for (let done = false; !done; ) {
      if (p >= n) done = true;
      p = this.advance(p, this.step(p));
    }
  }

  /** {@link lex}, telling `probe` each step's source range and start condition. */
  private lexProbed(probe: Probe): void {
    const { n } = this.scan;
    const { states } = this.g;
    let p = 0;
    for (let done = false; !done; ) {
      if (p >= n) done = true;
      const before = p;
      const mode = states[this.state] ?? '';
      const k = this.step(p);
      p = this.advance(p, k);
      const start = this.sourceStart(before);
      probe.lexed(start, p > before ? this.stepEnd(p, k) : start, mode);
    }
    probe.lexed(this.src.length, this.src.length, states[this.state] ?? '');
  }

  /** The source end, for the probe, of the step that applied rule `k` and ended at `p`. */
  private stepEnd(p: number, k: number): number {
    const end = this.sourceEnd(p - 1);
    // The step holds an offset right after its word (`Probe.lexed` takes `end` exclusive).
    return k >= 0 && this.g.words[(this.g.rules[k] as Rule).kind] === 1 ? end + 1 : end;
  }

  /**
   * The offset after the step at `p` that applied rule `k` (-1: none matched). Where jison would
   * throw, one `Error` token: zero-width before a line break, so the initial state lexes it;
   * else one code point, so the token never splits an emoji.
   */
  private advance(p: number, k: number): number {
    if (k >= 0) return this.matchEnd;
    if (p >= this.scan.n) return p;
    const c = this.scan.text.charCodeAt(p);
    const end = c === LF ? p : codePointEnd(this.scan.text, p);
    this.emit(Kind.Error, p, end);
    this.stack.length = 0;
    this.state = 0;
    return end;
  }

  /**
   * Apply the first matching rule of the current state at `p` (through the dispatch table for
   * an ASCII character): the rule's number, its end in {@link matchEnd}; -1 when none matches.
   */
  private step(p: number): number {
    const { scan, g, failedTo } = this;
    const c = p < scan.n ? scan.text.charCodeAt(p) : -1;
    const list = c >= 0 && c < 128 ? g.dispatch[this.state]?.[c] : g.conditions[this.state];
    if (list === undefined) return -1;
    for (const k of list) {
      const r = g.rules[k] as Rule;
      const lead = r.lead;
      if (lead !== undefined && p < (failedTo[k] ?? -1)) continue;
      const e = r.match(scan, p);
      if (e < 0) {
        // Every later start before the end of the run fails the same way; at its end a new
        // run may start (`- -->`: the space after the lone dash starts a delimiter).
        if (lead !== undefined) failedTo[k] = lead(scan, p);
        continue;
      }
      this.apply(k, r, p, e);
      return k;
    }
    return -1;
  }

  /** Rule `k` (`r`) matched `text[p, e)`: its action and its token. */
  private apply(k: number, r: Rule, p: number, e: number): void {
    this.onRule?.(k);
    if (r.action === A.begin) {
      this.stack.push(this.state);
      this.state = r.state;
    } else if (r.action === A.pop) this.state = this.stack.pop() ?? 0;
    else if (r.action === A.popBegin) this.state = r.state;
    this.emit(r.kind, p, e);
    this.matchEnd = e;
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset where `text[i]` starts (the end of the source past v12's own text). */
  private sourceStart(i: number): number {
    const v = this.v12;
    if (i >= v.length) return this.src.length;
    return v.starts ? (v.starts[i] ?? 0) : v.from + i;
  }

  /** Source offset where `text[i]` ends. */
  private sourceEnd(i: number): number {
    const v = this.v12;
    if (i >= v.length) return this.src.length;
    return v.ends ? (v.ends[i] ?? 0) : v.from + i + 1;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      this.w.push(h.kind === 'comment' ? Kind.Comment : Kind.Directive, h.start, h.end);
      this.starts.push(-1);
      this.ends.push(-1);
    }
  }

  /**
   * Write `text[s, e)` with its source range. The `\n` v12 appended is no source text: a token
   * that ends with it ends at the source's last character it took (zero-width at the end when it
   * took only that `\n`), so it never encloses a trailing comment.
   */
  private emit(kind: number, s: number, e: number): void {
    const start = this.sourceStart(s);
    const last = Math.min(e, this.v12.length);
    const end = last > s ? Math.max(start, this.sourceEnd(last - 1)) : start;
    this.trivia(start);
    this.w.push(kind, start, end);
    this.starts.push(s);
    this.ends.push(e);
  }
}

// --- Parser side ----------------------------------------------------------------------------

const COMMENTS = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive);

/**
 * Each token's source range with the glue jison matched next to it (quotes, `accDescr {` and
 * its `}`, a closing `]`), as a grammar's `attach-next` / `attach-prev` rules count them: an
 * opening one (`opens`) counts towards the next token, a closing one (`closes`) towards the
 * token right before it (adjacent in the text v12 lexed). `skipped` are the kinds the parser
 * never sees.
 */
export function outerRanges(
  l: V12Lex,
  opens: KindSet,
  closes: KindSet,
  skipped: KindSet
): [Uint32Array, Uint32Array] {
  const { kind, length } = l.tokens;
  const glue = new Glue(l);
  for (let i = 0; i < length; i++) {
    const k = kind[i] ?? 0;
    if (COMMENTS[k] === 1) continue;
    if (opens[k] === 1) glue.open(i);
    else if (closes[k] === 1) glue.close(i);
    else if (skipped[k] !== 1) glue.token(i);
  }
  return [glue.os, glue.oe];
}

/** The outer ranges of one lex, as {@link outerRanges} builds them token by token. */
class Glue {
  readonly os: Uint32Array;
  readonly oe: Uint32Array;
  /** Where the opening glue before the next token starts, or -1. */
  private pending = -1;
  /** The last token the parser sees, or -1. */
  private prev = -1;

  constructor(private readonly l: V12Lex) {
    this.os = Uint32Array.from(l.tokens.start);
    this.oe = Uint32Array.from(l.tokens.end);
  }

  /** Token `i` is opening glue: the first of a run starts the next token. */
  open(i: number): void {
    if (this.pending < 0) this.pending = this.l.tokens.start[i] ?? 0;
  }

  /** Token `i` is closing glue: it ends the token before it, when it has one. */
  close(i: number): void {
    const { l, prev } = this;
    // Adjacent in the text v12 lexed: comment lines may lie between them in the source.
    const touches = prev >= 0 && l.textEnd[prev] === l.textStart[i];
    if (touches && this.pending < 0) this.oe[prev] = l.tokens.end[i] ?? 0;
    this.pending = -1;
  }

  /** Token `i` is one the parser sees. */
  token(i: number): void {
    if (this.pending >= 0) this.os[i] = this.pending;
    this.pending = -1;
    this.prev = i;
  }
}
