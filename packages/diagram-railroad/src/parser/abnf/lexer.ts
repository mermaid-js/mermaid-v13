/**
 * The ABNF lexer (`railroad-abnf-beta`): the token types of v12's Chevrotain lexer for
 * `railroad-abnf.langium` (`@mermaid-js/parser@2.0.1`), in its order (parser-method §1, D213):
 *
 *   railroad-abnf-beta (longer alternative ABNF_RULENAME), `=`, `;` (longer alternative
 *   ABNF_COMMENT), `/`, `(`, `)`, `[`, `]`, TITLE, ACC_TITLE, ACC_DESCR, ABNF_RULENAME,
 *   ABNF_STRING, ABNF_NUMVAL, ABNF_REPEAT, ABNF_EXACT_REPEAT, ABNF_WHITESPACE (skipped),
 *   ABNF_YAML, ABNF_DIRECTIVE, ABNF_SINGLE_LINE_COMMENT, ABNF_COMMENT (hidden).
 *
 * `;` ends a rule only where nothing follows it on its line: `;` and anything after it, even a
 * blank, is the longer ABNF_COMMENT (so `a = "x" ; b = "y" ;` is one rule that never ends,
 * D513). A name is `[A-Za-z][A-Za-z0-9-]*` (`_` is an error) and a string `"[^"]*"`, with no
 * escapes and no `'`. See `../lexer.ts` for the rest.
 */
// cspell:words numval rulename
import {
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  isDigit,
  isHex,
  isLetter,
  LBRACKET,
  LPAREN,
  PERCENT,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  STAR,
} from '@mermaid-js/core/parser-kit';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { RailroadLexer } from '../lexer.ts';
import { T } from '../tokens.ts';

/** One-character keywords but `;`, in the grammar's order. */
const PUNCTUATION: Readonly<Record<number, number>> = {
  [EQUALS]: T.Equals,
  [SLASH]: T.Slash,
  [LPAREN]: T.LParen,
  [RPAREN]: T.RParen,
  [LBRACKET]: T.LBracket,
  [RBRACKET]: T.RBracket,
};

/** In `[A-Za-z0-9-]`. */
const isNamePart = (c: number) => isLetter(c) || isDigit(c) || c === DASH;
/** `x`, `X`, `d`, `D`, `b` or `B`. */
const isBase = (c: number) => {
  const lower = c | 0x20;
  return lower === 0x78 || lower === 0x64 || lower === 0x62;
};

/** Lex the ABNF body `src[from…]`. `view` comes from `sourceView` (default options). */
export function lexAbnf(src: string, from: number, view: SourceView): TokenStream {
  return new AbnfLexer(src, from, view).run();
}

class AbnfLexer extends RailroadLexer {
  protected scan(p: number, c = this.text.charCodeAt(p)): number {
    if (isLetter(c)) {
      const e = this.header('railroad-abnf-beta', p);
      if (e >= 0) return e;
    }
    if (c === SEMI) {
      // ABNF_COMMENT `;[^\n\r]*` is the longer alternative.
      const end = this.lineEnd(p + 1);
      return end > p + 1 ? this.match(T.SemiComment, end) : this.match(T.Semi, p + 1);
    }
    const kind = PUNCTUATION[c];
    if (kind !== undefined) return this.match(kind, p + 1);
    if (isLetter(c)) {
      const e = this.accessibility(p);
      if (e >= 0) return e;
      let j = p + 1;
      while (j < this.n && isNamePart(this.text.charCodeAt(j))) j++;
      return this.match(T.Id, j);
    }
    if (c === DQUOTE) {
      const close = this.text.indexOf('"', p + 1);
      if (close >= 0) return this.match(T.String, close + 1);
    }
    if (c === PERCENT) {
      const e = this.numVal(p);
      if (e >= 0) return e;
    }
    if (isDigit(c) || c === STAR) return this.repeat(p);
    return this.hidden(p, c, true);
  }

  /** ABNF_NUMVAL: `%[xXdDbB][0-9A-Fa-f]+(?:-[0-9A-Fa-f]+|\.[0-9A-Fa-f]+)*`. */
  private numVal(p: number): number {
    const { text } = this;
    if (!isBase(text.charCodeAt(p + 1))) return -1;
    let j = this.hex(p + 2);
    if (j === p + 2) return -1;
    for (;;) {
      const c = text.charCodeAt(j);
      if (c !== DASH && c !== DOT) break;
      const k = this.hex(j + 1);
      if (k === j + 1) break;
      j = k;
    }
    return this.match(T.NumVal, j);
  }

  /** The end of the run of hex digits from `q`. */
  private hex(q: number): number {
    let j = q;
    while (j < this.n && isHex(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** ABNF_REPEAT `[0-9]*\*[0-9]*`, else ABNF_EXACT_REPEAT `[0-9]+`, at a digit or `*`. */
  private repeat(p: number): number {
    const { text, n } = this;
    let j = p;
    while (j < n && isDigit(text.charCodeAt(j))) j++;
    if (text.charCodeAt(j) !== STAR) return this.match(T.ExactRepeat, j);
    j++;
    while (j < n && isDigit(text.charCodeAt(j))) j++;
    return this.match(T.Repeat, j);
  }
}
