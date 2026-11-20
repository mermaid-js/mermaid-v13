/**
 * The PEG lexer (`railroad-peg-beta`): the token types of v12's Chevrotain lexer for
 * `railroad-peg.langium` (`@mermaid-js/parser@2.0.1`), in its order (parser-method §1, D213):
 *
 *   railroad-peg-beta (longer alternative PEG_ID), `<-`, `;`, `/`, `&`, `!`, `?`, `*`, `+`, `(`,
 *   `)`, `.`, TITLE, ACC_TITLE, ACC_DESCR, PEG_ID, PEG_STRING, PEG_WHITESPACE (skipped),
 *   PEG_YAML, PEG_DIRECTIVE, PEG_SINGLE_LINE_COMMENT, PEG_LINE_COMMENT (hidden).
 *
 * `#` starts a comment to the line end, unless it starts a `#name;` entity, which v12 had
 * turned into a placeholder no rule takes (`../lexer.ts`). There are no character classes
 * (`[a-z]` is an error). See `../lexer.ts` for the rest.
 */
import {
  AMP,
  DASH,
  DOT,
  HASH,
  LPAREN,
  LT,
  QUESTION,
  RPAREN,
  SEMI,
  SLASH,
  STAR,
} from '@mermaid-js/core/parser-kit';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { isIdStart, RailroadLexer } from '../lexer.ts';
import { T } from '../tokens.ts';

const BANG = 0x21;
const PLUS = 0x2b;

/** One-character keywords after `<-`, in the grammar's order. */
const PUNCTUATION: Readonly<Record<number, number>> = {
  [SEMI]: T.Semi,
  [SLASH]: T.Slash,
  [AMP]: T.Amp,
  [BANG]: T.Bang,
  [QUESTION]: T.Question,
  [STAR]: T.Star,
  [PLUS]: T.Plus,
  [LPAREN]: T.LParen,
  [RPAREN]: T.RParen,
  [DOT]: T.Dot,
};

/** Lex the PEG body `src[from…]`. `view` comes from `sourceView` (default options). */
export function lexPeg(src: string, from: number, view: SourceView): TokenStream {
  return new PegLexer(src, from, view).run();
}

class PegLexer extends RailroadLexer {
  protected scan(p: number, c = this.text.charCodeAt(p)): number {
    if (isIdStart(c)) {
      const e = this.header('railroad-peg-beta', p);
      if (e >= 0) return e;
    }
    if (c === LT && this.text.charCodeAt(p + 1) === DASH) return this.match(T.Arrow, p + 2);
    const kind = PUNCTUATION[c];
    if (kind !== undefined) return this.match(kind, p + 1);
    if (isIdStart(c)) {
      const e = this.accessibility(p);
      if (e >= 0) return e;
      return this.match(T.Id, this.idEnd(p));
    }
    if (RailroadLexer.isQuote(c)) {
      const e = this.string(p, c);
      if (e >= 0) return e;
    }
    const e = this.hidden(p, c, true);
    if (e >= 0) return e;
    return c === HASH ? this.match(T.HashComment, this.lineEnd(p + 1)) : -1;
  }
}
