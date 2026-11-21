/**
 * The quadrant parser's public surface: the parser (#301), its AST and the lexer (#300), gated
 * against v12's jison lexer.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import { COMMENTS, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { tokenValue, v12Text } from '@mermaid-js/shared/parser/v12-text';
import { lex } from './lexer.ts';
import type { QuadrantLex } from './lexer.ts';

export { parseQuadrant } from './parser.ts';
export type { QuadrantParseOptions, QuadrantParseResult } from './parser.ts';
export { detectQuadrant } from './detect.ts';
export type * from './ast.ts';
export { tokenValue } from '@mermaid-js/shared/parser/v12-text';
export { JISON_NAMES, T as QuadrantTokenKind } from './tokens.ts';
export type { QuadrantLex } from './lexer.ts';
export type { V12Text } from '@mermaid-js/shared/parser/v12-text';

/**
 * A token of this diagram: its `kind` is a `T` kind or a shared `Kind`, its `text` as v12's
 * parser read it (CRLF as LF, entities as `&name;`).
 */
export type QuadrantToken = SeenToken;

/**
 * Lex a whole quadrant source (front matter and directives located first). `onRule` is told
 * the jison rule number of every rule that matches (dev use: the rule-coverage gate).
 */
export function lexQuadrant(src: string, onRule?: (rule: number) => void): QuadrantLex {
  const pre = preprocess(src);
  const directives = pre.directives.map((d) => d.range);
  return lex(src, v12Text(src, pre.bodyStart, directives), onRule);
}

/**
 * The significant quadrant tokens of `src` (comments, directives and the final `Kind.EOF` left
 * out), for editors and tests.
 */
export function quadrantTokens(src: string): QuadrantToken[] {
  const l = lexQuadrant(src);
  return keptTokens(l.tokens, COMMENTS, (j) => tokenValue(l, j));
}
