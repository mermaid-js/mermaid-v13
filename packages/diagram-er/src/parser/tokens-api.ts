import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { lex } from './lexer.ts';
import { decodeEntities } from './source.ts';

export interface ErToken {
  /** A `T` kind or a shared `Kind`. */
  kind: number;
  /**
   * The token's text as v12's lexer saw it (CRLF as LF, removed spans left out), with v12's
   * entity placeholders decoded (`#amp;` reads `&amp;`). A token that ends the text holds the
   * line break v12 appended.
   */
  text: string;
  range: Range;
}

/**
 * The significant ER tokens of `src` (comments, directives and the final `Kind.EOF` left out),
 * for editors and for the lexer-parity gate.
 */
export function erTokens(src: string): ErToken[] {
  const { tokens, textStart, textEnd, view } = lex(src);
  const out: ErToken[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    if (kind === Kind.Comment || kind === Kind.Directive || kind === Kind.EOF) continue;
    const text = view.text.slice(textStart[j], textEnd[j]);
    out.push({
      kind,
      text: decodeEntities(text),
      range: { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 },
    });
  }
  return out;
}
