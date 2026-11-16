// cspell:words betax SPACELINE SPACELIST
/**
 * Ishikawa lexer: the rules of v12's `ishikawa.jison` in order (parser-method §1), with the
 * source mapping copied from the kanban lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}),
 *   line breaks as v12 had them (CRLF and CR as LF) and leading blanks trimmed, and maps each
 *   token back to its range in the source, which is never rewritten. A token that runs over a
 *   removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`).
 *
 * jison facts it reproduces: there are no start conditions and the first rule in order wins
 * (no longest match); the lexer is case-insensitive (ASCII letters only) and both keywords end
 * in `\b`, so `ishikawa-betax` is `ishikawa` then the text `-betax`, and a keyword is a token
 * wherever a token starts (at a line start inside the document too); `\s*%%.*` comes first, so
 * it takes the blanks and line breaks before a `%%` that v12's comment removal left; a regex
 * `.` stops at LF, CR, U+2028 and U+2029, `[\n]` and `[^\n]` at LF only; `[\s]+[\n]`
 * backtracks to the last line break of a blank run, so `[\n]+` only ever takes one and
 * `[\s]+` none. Every character matches some rule: jison never throws here. Every scan is
 * linear in the text it consumes (R-PARSE-7).
 */
import { cook, isSpace, Kind, LF, PERCENT } from '@mermaid-js/core/parser-kit';
import { StateLexer } from '@mermaid-js/shared/parser/state';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { StateLexerOptions } from '@mermaid-js/shared/parser/state';
import { keywordAt, lower } from './keywords.ts';
import { T } from './tokens.ts';

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}). Read token text only through this.
   */
  text(j: number): string;
}

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 8, crlf: 'fold', dropSpace: true };

/** Lex the ishikawa body `src[from…]`. `view` comes from {@link sourceView}. */
export function lex(src: string, from: number, view: SourceView): Lexed {
  const tokens = new IshikawaLexer(src, from, view, OPTIONS).run();
  return {
    tokens,
    text: (j) => cook(src, tokens.start[j] ?? 0, tokens.end[j] ?? 0, view),
  };
}

/** One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source. */
class IshikawaLexer extends StateLexer {
  /** The next LF at or after the last {@link lineEnd} lookup (-2: not looked up). */
  private nextLf = -2;

  run(): TokenStream {
    const { text, n } = this;
    const textEnd = this.len;
    this.trim();
    while (this.p < n) this.step(text.charCodeAt(this.p));
    // At the end jison tries the rules once more on the empty input: `<<EOF>>` matches it.
    this.emit(T.Eof, textEnd, textEnd);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The first LF at or after `q` (the appended one at the latest), as {@link dotEnd} keeps it. */
  protected override lineEnd(q: number): number {
    if (this.nextLf < q) this.nextLf = this.text.indexOf('\n', q);
    return this.nextLf;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** The first rule of `ishikawa.jison` that matches at `p`, written as its token. */
  protected step(c: number): void {
    const { text: input, p } = this;
    // `\s*\%\%.*`.
    const blankEnd = isSpace(c) ? this.spaces(p) : p;
    if (input.charCodeAt(blankEnd) === PERCENT && input.charCodeAt(blankEnd + 1) === PERCENT) {
      this.emit(T.CommentLine, p, this.dotEnd(blankEnd + 2));
      return;
    }
    // `"ishikawa-beta"` and `"ishikawa"` (jison adds `\b` after a literal ending in a letter).
    const keywordLength = lower(c) === 0x69 ? keywordAt(input, p, this.n) : 0;
    if (keywordLength > 0) {
      this.emit(T.Ishikawa, p, p + keywordLength);
      return;
    }
    if (blankEnd > p) {
      // `[\s]+[\n]`: back from the end of the blank run to its last LF (not the first blank).
      let lastLf = blankEnd - 1;
      while (lastLf > p && input.charCodeAt(lastLf) !== LF) lastLf--;
      if (lastLf > p) {
        this.emit(T.SpaceLine, p, lastLf + 1);
        return;
      }
      // `[\n]+`: one LF (a second one right after it would have been a SPACELINE).
      if (c === LF) {
        this.emit(Kind.Newline, p, p + 1);
        return;
      }
      // `[\s]+`: a blank run with no LF.
      this.emit(T.SpaceList, p, blankEnd);
      return;
    }
    // `[^\n]+`: what is left is not `\s`, so not an LF.
    this.emit(T.Text, p, this.lineEnd(p));
  }
}
