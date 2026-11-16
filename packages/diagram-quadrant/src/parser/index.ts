/**
 * The quadrant parser's public surface: the parser (#301), its AST and the lexer (#300), gated
 * against v12's jison lexer.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
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

export interface QuadrantToken {
  /** A `QuadrantTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (CRLF as LF, entities as `&name;`). */
  text: string;
  range: Range;
}

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
 * The significant quadrant tokens of `src` (comments and directives left out), for editors
 * and tests.
 */
export function quadrantTokens(src: string): QuadrantToken[] {
  const l = lexQuadrant(src);
  const { kind, start, end, length } = l.tokens;
  const out: QuadrantToken[] = [];
  for (let j = 0; j < length - 1; j++) {
    const k = kind[j] ?? Kind.EOF;
    if (k === Kind.Comment || k === Kind.Directive) continue;
    out.push({
      kind: k,
      text: tokenValue(l, j),
      range: { start: start[j] ?? 0, end: end[j] ?? 0 },
    });
  }
  return out;
}
