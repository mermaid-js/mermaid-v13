/**
 * Class-diagram lexer: v12's `classDiagram.jison` lexer rules ({@link RULES}), run on exactly
 * the text v12's lexer saw ({@link v12Text}), with every token mapped back to its source range
 * (DESIGN §4.3). The source is never rewritten. Comments and directives v12 removed before
 * lexing are trivia tokens with their own ranges, in source order.
 *
 * jison semantics kept: per state, the first rule that matches wins; a rule without a token
 * skips its match; at the end of the text the rules are tried once more (the `<<EOF>>` rules
 * and empty values), then lexing stops. Where jison would throw, v13 writes one `Error` token
 * for the character, resets to the initial state and carries on (for recovery).
 *
 * Every scan is linear in the text it consumes (R-PARSE-7).
 */
import { Kind, TokenWriter } from '@mermaid-js/core/parser-kit';
import type { Probe, TokenStream } from '@mermaid-js/core/parser-kit';
import { A, CONDITIONS, RULES, S } from './rules.ts';
import type { Rule, Scan } from './rules.ts';
import type { Hole, V12Text } from './source.ts';

/** A lex: the tokens (source offsets), and each token's range in v12's text. */
export interface ClassLex {
  tokens: TokenStream;
  /** Start of token `i` in {@link V12Text.text}; trivia from removed spans get -1. */
  textStart: Int32Array;
  /** End of token `i` in {@link V12Text.text} (it may include the `\n` v12 appended). */
  textEnd: Int32Array;
  v12: V12Text;
}

/** Start condition names by number, for the probe's lexer mode (jison's names). */
const JISON_STATE: Readonly<Record<string, string>> = {
  classBody: 'class-body',
  namespaceBody: 'namespace-body',
};
const S_NAMES: readonly string[] = /* @__PURE__ */ Object.keys(S).map((k) => JISON_STATE[k] ?? k);

/**
 * Lex a class source as v12 saw it (`v12`), writing v12's removed spans as trivia. `from` (a
 * source offset) starts the lex there in the initial state, as the parser does after an error
 * inside a string or other lexer mode, with `states` pushed over the initial state (the
 * namespace bodies open there). With a `probe`, the start condition at the probe's
 * offset is recorded as its mode.
 */
export function lex(
  src: string,
  v12: V12Text,
  onRule?: (rule: number) => void,
  probe?: Probe,
  from = 0,
  states: readonly number[] = []
): ClassLex {
  return new ClassLexer(src, v12, v12.holes, onRule).run(from, probe, states);
}

class ClassLexer {
  private readonly scan: Scan;
  private readonly w: TokenWriter;
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  private readonly stack: number[] = [S.INITIAL];
  private hole = 0;

  constructor(
    private readonly src: string,
    private readonly v12: V12Text,
    private readonly holes: readonly Hole[],
    private readonly onRule: ((rule: number) => void) | undefined
  ) {
    this.scan = {
      text: v12.text,
      dirFailed: new Int32Array(4).fill(-1),
      dirNext: -2,
      lineEndAt: -1,
    };
    // About one token per four characters.
    this.w = new TokenWriter((v12.text.length >> 2) + 8);
  }

  run(from: number, probe: Probe | undefined, states: readonly number[]): ClassLex {
    const n = this.v12.text.length;
    this.stack.push(...states);
    let p = from > 0 ? this.textIndex(from) : 0;
    while ((this.holes[this.hole]?.start ?? Infinity) < from) this.hole++;
    for (let done = false; !done; ) {
      if (p >= n) done = true;
      const before = p;
      const mode = probe ? (S_NAMES[this.stack[this.stack.length - 1] ?? 0] ?? '') : '';
      const at = this.step(p);
      if (at >= 0) p = at;
      else if (p < n) {
        this.emit(Kind.Error, p, p + 1);
        this.stack.length = 1;
        this.stack[0] = S.INITIAL;
        p++;
      }
      probe?.lexed(this.sourceStart(before), this.sourceStart(p), mode);
    }
    probe?.lexed(
      this.src.length,
      this.src.length,
      S_NAMES[this.stack[this.stack.length - 1] ?? 0] ?? ''
    );
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

  /** Apply the first matching rule of the current state at `p`: the new offset, or -1. */
  private step(p: number): number {
    const state = this.stack[this.stack.length - 1] ?? S.INITIAL;
    for (const k of CONDITIONS[state] ?? []) {
      const rule = RULES[k] as Rule;
      const e = rule.match(this.scan, p);
      if (e < 0) continue;
      this.onRule?.(k);
      this.act(rule);
      if (rule.action === A.popLess) return p;
      if (rule.kind >= 0) this.emit(rule.kind, p, e);
      return e;
    }
    return -1;
  }

  private act(rule: Rule): void {
    const st = this.stack;
    const pop = () => {
      if (st.length > 1) st.pop();
    };
    switch (rule.action) {
      case A.begin:
        st.push(rule.state);
        break;
      case A.pop:
      case A.popLess:
        pop();
        break;
      case A.pop2:
        pop();
        pop();
        break;
      case A.popBegin:
        pop();
        st.push(rule.state);
        break;
      default:
        break;
    }
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Index of the first character of v12's text at or after source offset `at`. */
  private textIndex(at: number): number {
    const v = this.v12;
    if (!v.starts) return Math.max(0, Math.min(at - v.from, v.length));
    let lo = 0;
    let hi = v.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((v.starts[mid] ?? 0) < at) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

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

  private emit(kind: number, s: number, e: number): void {
    const start = this.sourceStart(s);
    const end = e > s ? this.sourceEnd(e - 1) : start;
    this.trivia(start);
    this.w.push(kind, start, end);
    this.starts.push(s);
    this.ends.push(e);
  }
}
