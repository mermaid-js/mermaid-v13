/**
 * The EBNF lexer (`railroad-ebnf-beta`): the token types of v12's Chevrotain lexer for
 * `railroad-ebnf.langium` (`@mermaid-js/parser@2.0.1`), in its order (parser-method §1, D213):
 *
 *   railroad-ebnf-beta (longer alternative EBNF_ID), `::=`, `=`, `;`, `|`, `,`, `(` (longer
 *   alternative EBNF_ISO_COMMENT), `)`, `[`, `]`, `{`, `}`, `?` (longer alternative
 *   EBNF_SPECIAL_SEQUENCE), `*`, `+`, `-` (longer alternative EBNF_YAML), TITLE, ACC_TITLE,
 *   ACC_DESCR, EBNF_ID, EBNF_STRING, EBNF_SPECIAL_SEQUENCE, EBNF_WHITESPACE (skipped), EBNF_YAML,
 *   EBNF_DIRECTIVE, EBNF_SINGLE_LINE_COMMENT, EBNF_BLOCK_COMMENT, EBNF_ISO_COMMENT (hidden).
 *
 * Langium gave three punctuation keywords a longer alternative, so `(*…*)` is a comment, `? x ?`
 * a special sequence and `---` … `---` a YAML block, each only where it is longer than the one
 * character; their own token types come too late in the order to match anywhere else. See
 * `../lexer.ts` for the rest.
 */
import {
  COLON,
  COMMA,
  DASH,
  EQUALS,
  isSpace,
  LBRACE,
  LBRACKET,
  LPAREN,
  PIPE,
  QUESTION,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  STAR,
} from '@mermaid-js/core/parser-kit';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { isIdStart, RailroadLexer } from '../lexer.ts';
import { T } from '../tokens.ts';

const PLUS = 0x2b;

/** One-character keywords after `::=`, in the grammar's order, but for the three below. */
const PUNCTUATION: Readonly<Record<number, number>> = {
  [EQUALS]: T.Equals,
  [SEMI]: T.Semi,
  [PIPE]: T.Pipe,
  [COMMA]: T.Comma,
  [RPAREN]: T.RParen,
  [LBRACKET]: T.LBracket,
  [RBRACKET]: T.RBracket,
  [LBRACE]: T.LBrace,
  [RBRACE]: T.RBrace,
  [STAR]: T.Star,
  [PLUS]: T.Plus,
};

/** Lex the EBNF body `src[from…]`. `view` comes from `sourceView` (default options). */
export function lexEbnf(src: string, from: number, view: SourceView): TokenStream {
  return new EbnfLexer(src, from, view).run();
}

class EbnfLexer extends RailroadLexer {
  protected scan(p: number, c: number): number {
    if (isIdStart(c)) {
      const e = this.header('railroad-ebnf-beta', p);
      if (e >= 0) return e;
    }
    if (c === COLON && this.text.startsWith('::=', p)) return this.match(T.Define, p + 3);
    if (c === LPAREN) {
      const e = this.comment(p, LPAREN, T.IsoComment);
      return e >= 0 ? e : this.match(T.LParen, p + 1);
    }
    if (c === QUESTION) {
      const e = this.special(p);
      return e >= 0 ? e : this.match(T.Question, p + 1);
    }
    if (c === DASH) {
      const e = this.yaml(p);
      return e >= 0 ? e : this.match(T.Minus, p + 1);
    }
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
    const e = this.hidden(p, c, false);
    if (e >= 0) return e;
    return this.comment(p, SLASH, T.BlockComment);
  }

  /**
   * EBNF_SPECIAL_SEQUENCE: `\?(?=[^?;]*[^?\s;][^?;]*\?)[^?;]*\?`: the `?` at `p` to the next
   * `?`, with no `;` between and something other than `\s` inside. The scan stops at the next
   * `?` or `;`, so the scans from every `?` read the text about once.
   */
  private special(p: number): number {
    const { text, n } = this;
    let filled = false;
    for (let j = p + 1; j < n; j++) {
      const c = text.charCodeAt(j);
      if (c === SEMI) return -1;
      if (c === QUESTION) return filled ? this.match(T.Special, j + 1) : -1;
      if (!filled && !isSpace(c)) filled = true;
    }
    return -1;
  }
}
