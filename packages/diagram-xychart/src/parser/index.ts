/**
 * The XY chart parser's public surface: the parser (#508), its AST, the model builder, and the
 * lexer (#507), gated against v12's jison lexer.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';
import type { XyChartLex } from './lexer.ts';
import { tokenValue } from './value.ts';
import { v12Text } from './v12-text.ts';

export { parseXyChart } from './parser.ts';
export type { XyChartParseOptions, XyChartParseResult } from './parser.ts';
export { detectXyChart } from './detect.ts';
export { XyChartBuilder } from './build.ts';
export type { XyChartPointInput } from './build.ts';
export type * from './ast.ts';
export { tokenValue } from './value.ts';
export { JISON_NAMES, T as XyChartTokenKind } from './tokens.ts';
export type { XyChartLex } from './lexer.ts';
export type { V12Text } from './v12-text.ts';

export interface XyChartToken {
  /** An `XyChartTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (CRLF as LF, entities as `&name;`). */
  text: string;
  range: Range;
}

/**
 * Lex a whole XY chart source (front matter located first; directives as v12's regex reads
 * them, `v12-text.ts`). `onRule` is told the
 * rule number of every rule that matches (dev use: the rule-coverage gate).
 */
export function lexXyChart(src: string, onRule?: (rule: number) => void): XyChartLex {
  return lex(src, v12Text(src, preprocess(src).bodyStart), onRule);
}

/**
 * The significant XY chart tokens of `src` (comments and directives left out), for editors and
 * tests.
 */
export function xyChartTokens(src: string): XyChartToken[] {
  const l = lexXyChart(src);
  const { kind, start, end, length } = l.tokens;
  const out: XyChartToken[] = [];
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
