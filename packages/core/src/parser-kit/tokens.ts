/**
 * Token kinds shared by every diagram lexer. Kinds are plain numbers; a diagram declares
 * its own kinds as an `as const` object starting at {@link FIRST_DIAGRAM_KIND}
 * (TS enums are banned by lint).
 *
 * ```ts
 * const T = { Id: FIRST_DIAGRAM_KIND, Arrow: FIRST_DIAGRAM_KIND + 1 } as const;
 * ```
 */
export const Kind = {
  /** End of input. Every stream ends with exactly one, zero-width at `source.length`. */
  EOF: 0,
  /** A line break: `\n`, `\r\n` or `\r` (one token, the source is never normalised). */
  Newline: 1,
  /** `%% …` comment. Trivia: lexers emit it, parsers skip it. */
  Comment: 2,
  /** `%%{ … }%%` directive, left in place and skipped as trivia. */
  Directive: 3,
  /** Blanks between tokens, when a lexer chooses to keep them. Trivia. */
  Space: 4,
  /** Input the lexer could not match. The parser reports it. */
  Error: 5,
} as const;

/** Numeric token kind: a value of {@link Kind} or a diagram's own kind object. */
export type TokenKind = number;

/** First kind number a diagram may use; 0–15 are reserved for {@link Kind}. */
export const FIRST_DIAGRAM_KIND = 16;

/**
 * Tokens as parallel arrays: token `i` is `kind[i]`, source `[start[i], end[i])`, `text[i]`.
 * There are no token objects. Offsets are into the original source.
 */
export interface TokenStream {
  readonly kind: Uint16Array;
  readonly start: Uint32Array;
  readonly end: Uint32Array;
  readonly text: readonly string[];
  /** Number of tokens, including the final EOF. */
  readonly length: number;
}

/** Append-only builder for a {@link TokenStream}; create one per lex. */
export class TokenWriter {
  private readonly k: number[] = [];
  private readonly s: number[] = [];
  private readonly e: number[] = [];
  private readonly t: string[] = [];

  /** Append one token. `text` is usually `source.slice(start, end)`. */
  push(kind: TokenKind, start: number, end: number, text: string): void {
    this.k.push(kind);
    this.s.push(start);
    this.e.push(end);
    this.t.push(text);
  }

  /** Append the EOF token at `sourceLength` and return the finished stream. */
  finish(sourceLength: number): TokenStream {
    this.push(Kind.EOF, sourceLength, sourceLength, '');
    return {
      kind: Uint16Array.from(this.k),
      start: Uint32Array.from(this.s),
      end: Uint32Array.from(this.e),
      text: this.t,
      length: this.t.length,
    };
  }
}
