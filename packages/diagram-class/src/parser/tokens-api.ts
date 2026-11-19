import { preprocess } from '@mermaid-js/core/preprocess';
import { COMMENTS, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { tokenValue, v12Text } from '@mermaid-js/shared/parser/v12-text';
import { lex } from './lexer.ts';
import type { ClassLex } from './lexer.ts';

export { tokenValue };

/**
 * A token of this diagram: its `kind` is a `T` kind or a shared `Kind`, its `text` as v12's
 * parser read it (CRLF as LF, entities as `&name;`).
 */
export type ClassToken = SeenToken;

/**
 * Lex a whole class-diagram source (front matter and directives located first). `onRule` is
 * told the jison rule number of every rule that matches (dev use: the rule-coverage gate).
 */
export function lexClass(src: string, onRule?: (rule: number) => void): ClassLex {
  const pre = preprocess(src);
  const directives = pre.directives.map((d) => d.range);
  return lex(src, v12Text(src, pre.bodyStart, directives, true), onRule);
}

/**
 * The significant class-diagram tokens of `src` (comments, directives and the final `Kind.EOF`
 * left out), for editors and for the lexer-parity gate.
 */
export function classTokens(src: string): ClassToken[] {
  const l = lexClass(src);
  return keptTokens(l.tokens, COMMENTS, (j) => tokenValue(l, j));
}
