/**
 * The IR lexer (`railroad-beta`): the token types of v12's Chevrotain lexer for
 * `railroad.langium` (`@mermaid-js/parser@2.0.1`), in its order (parser-method §1, D213):
 *
 *   railroad-beta, nonterminal, zeroOrMore, oneOrMore, sequence, optional, terminal, special,
 *   choice (each with longer alternative RR_ID), `=`, `;`, `(`, `,`, `)`, TITLE, ACC_TITLE,
 *   ACC_DESCR, RR_ID, RR_STRING, RR_WHITESPACE (skipped), RR_YAML, RR_DIRECTIVE,
 *   RR_SINGLE_LINE_COMMENT, RR_BLOCK_COMMENT (hidden).
 *
 * A keyword followed by a name character is a name (`sequenceX`), and a name that is a keyword
 * is the keyword (`choice = …` cannot define a rule, D513). See `../lexer.ts` for the rest.
 */
import { COMMA, EQUALS, LPAREN, RPAREN, SEMI, SLASH } from '@mermaid-js/core/parser-kit';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { isIdStart, RailroadLexer } from '../lexer.ts';
import { T } from '../tokens.ts';

/** The keywords, in the grammar's order. */
const KEYWORDS: readonly (readonly [word: string, kind: number])[] = [
  ['nonterminal', T.KwNonterminal],
  ['zeroOrMore', T.KwZeroOrMore],
  ['oneOrMore', T.KwOneOrMore],
  ['sequence', T.KwSequence],
  ['optional', T.KwOptional],
  ['terminal', T.KwTerminal],
  ['special', T.KwSpecial],
  ['choice', T.KwChoice],
];

/** Lex the IR body `src[from…]`. `view` comes from `sourceView` (default options). */
export function lexIr(src: string, from: number, view: SourceView): TokenStream {
  return new IrLexer(src, from, view).run();
}

class IrLexer extends RailroadLexer {
  protected scan(p: number, c: number): number {
    if (isIdStart(c)) {
      const e = this.header('railroad-beta', p);
      if (e >= 0) return e;
      for (const [word, kind] of KEYWORDS) {
        if (!this.text.startsWith(word, p)) continue;
        // RR_ID is the longer alternative.
        const id = this.idEnd(p);
        return id > p + word.length ? this.match(T.Id, id) : this.match(kind, p + word.length);
      }
    }
    if (c === EQUALS) return this.match(T.Equals, p + 1);
    if (c === SEMI) return this.match(T.Semi, p + 1);
    if (c === LPAREN) return this.match(T.LParen, p + 1);
    if (c === COMMA) return this.match(T.Comma, p + 1);
    if (c === RPAREN) return this.match(T.RParen, p + 1);
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
    return this.comment(p, SLASH, T.BlockComment);
  }
}
