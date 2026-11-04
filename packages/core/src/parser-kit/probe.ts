/**
 * Probe mode (DESIGN §4.5 "Probe", R-LANG-7, D95): a parse that also records what the parser
 * would accept at one offset, for completion. Recovery and every other output stay as they
 * are; without a probe nothing here runs.
 *
 * The probed token is the first significant token that ends at or after the offset, except one
 * that ends exactly there with a non-word character (`:::`, `-->`, `[`): the cursor follows it
 * rather than extends it, so the token after it is probed. A word the cursor is in or at the end
 * of is probed itself, and the text typed of it so far (without leading blanks) is the prefix.
 */
import { isSpace, isUnicodeLetter, isWord } from './chars.ts';
import type { Range } from './positions.ts';
import type { TokenKind } from './tokens.ts';
import type { TokenView } from './view.ts';

/** `ParseResult.probe`. */
export interface ProbeResult {
  offset: number;
  /** Kinds the parser tested or would accept at the probed token, first-tested first. */
  expected: TokenKind[];
  /** The lexer's mode at the offset (flowchart: the jison start condition); `''` if unset. */
  mode: string;
  /** What was typed of the probed token before the offset; empty at a token boundary. */
  prefix: Range;
}

/** Collects the {@link ProbeResult} of one parse. Create one per parse. */
export class Probe {
  readonly offset: number;
  /** Set by the lexer through {@link lexed}. */
  mode = '';
  private kinds: TokenKind[] = [];
  private start = -1;
  private frozen = false;
  private modeSet = false;

  constructor(
    private readonly source: string,
    offset: number
  ) {
    this.offset = Math.max(0, Math.min(offset, source.length));
  }

  /** Whether the token `[start, end)` is the probed token or after it. */
  covers(start: number, end: number): boolean {
    const o = this.offset;
    if (end !== o) return end > o;
    if (start === end) return true;
    const c = this.source.charCodeAt(end - 1);
    return isWord(c) || isUnicodeLetter(c);
  }

  /**
   * Whether token `i` of `view` is the probed token. `from` is the source offset the view was
   * lexed from, for a view lexed again mid-document; its tokens before `from` are not in it.
   */
  isAt(view: TokenView, i: number, from = 0): boolean {
    if (!this.covers(view.start[i] ?? 0, view.end[i] ?? 0)) return false;
    return i === 0
      ? from <= this.offset
      : !this.covers(view.start[i - 1] ?? 0, view.end[i - 1] ?? 0);
  }

  /** The parser tests the probed token, which starts at `start`, for `kinds`. */
  tested(kinds: TokenKind | readonly TokenKind[], start: number): void {
    if (this.frozen) return;
    if (this.start < 0) this.start = start;
    if (typeof kinds === 'number') {
      if (!this.kinds.includes(kinds)) this.kinds.push(kinds);
      return;
    }
    for (const k of kinds) if (!this.kinds.includes(k)) this.kinds.push(k);
  }

  /**
   * The parser recovers from an error. Once the probed token has been tested, later tests of
   * it come from recovery and are not expectations, so recording stops.
   */
  freeze(): void {
    if (this.start >= 0) this.frozen = true;
  }

  /** Forget what was recorded: the parser lexes the text around the offset again. */
  reset(): void {
    this.kinds = [];
    this.start = -1;
    this.frozen = false;
    this.modeSet = false;
  }

  /**
   * The lexer read source `[start, end)` in `mode`. Call it for each step in order, then once
   * with the mode it ends in, at the end of the text. The mode at the offset is that of the
   * step whose text holds it, else of the first step at or after it.
   */
  lexed(start: number, end: number, mode: string): void {
    if (this.modeSet) return;
    const o = this.offset;
    if (start >= o || end > o) {
      this.mode = mode;
      this.modeSet = true;
    }
  }

  result(): ProbeResult {
    const o = this.offset;
    let start = this.start >= 0 && this.start < o ? this.start : o;
    while (start < o && isSpace(this.source.charCodeAt(start))) start++;
    return { offset: o, expected: [...this.kinds], mode: this.mode, prefix: { start, end: o } };
  }
}
