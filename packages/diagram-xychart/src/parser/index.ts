/**
 * The XY chart parser's public surface: the parser (#508), its AST, and the lexer (#507), gated
 * against v12's jison lexer.
 */
import { preprocess } from '@mermaid-js/core/preprocess';
import { COMMENTS, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { tokenValue } from '@mermaid-js/shared/parser/v12-text';
import { lex } from './lexer.ts';
import type { XyChartLex } from './lexer.ts';
import { v12Text } from './v12-text.ts';

export {
  parseXyChart,
  XYCHART_NO_PLOT,
  XYCHART_PLOT_BEFORE_AXIS,
  XYCHART_UNCLOSED_DESCRIPTION,
} from './parser.ts';
export type { XyChartParseOptions, XyChartParseResult } from './parser.ts';
export { detectXyChart } from './detect.ts';
export type * from './ast.ts';
export { JISON_NAMES, T as XyChartTokenKind } from './tokens.ts';
export type { XyChartLex } from './lexer.ts';

/**
 * A token of this diagram: its `kind` is a `T` kind or a shared `Kind`, its `text` as v12's
 * parser read it (CRLF as LF, entities as `&name;`).
 */
export type XyChartToken = SeenToken;

/**
 * Lex a whole XY chart source (front matter located first; directives as v12's regex reads
 * them, `v12-text.ts`). `onRule` is told the
 * rule number of every rule that matches (dev use: the rule-coverage gate).
 */
export function lexXyChart(src: string, onRule?: (rule: number) => void): XyChartLex {
  return lex(src, v12Text(src, preprocess(src).bodyStart), onRule);
}

/**
 * The significant XY chart tokens of `src` (comments, directives and the final `Kind.EOF` left
 * out), for editors and tests.
 */
export function xyChartTokens(src: string): XyChartToken[] {
  const l = lexXyChart(src);
  return keptTokens(l.tokens, COMMENTS, (j) => tokenValue(l, j));
}
