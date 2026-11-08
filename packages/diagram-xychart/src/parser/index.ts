/**
 * The XY chart parser's public surface so far (#507): the lexer, gated against v12's jison
 * lexer. The parser (#508) builds on {@link lexXyChart}.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';
import type { XyChartLex } from './lexer.ts';
import { v12Text } from './v12-text.ts';

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
 * Lex a whole XY chart source (front matter and directives located first). `onRule` is told the
 * rule number of every rule that matches (dev use: the rule-coverage gate).
 */
export function lexXyChart(src: string, onRule?: (rule: number) => void): XyChartLex {
  const pre = preprocess(src);
  const directives = pre.directives.map((d) => d.range);
  return lex(src, v12Text(src, pre.bodyStart, directives), onRule);
}

/** Undo v12's `encodeEntities` placeholders, as v12's renderer did (`decodeEntities`). */
const decodeEntities = (text: string): string =>
  text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');

/**
 * The text of token `i` as v12's parser read it (less the `\n` v12 appended), or the source text
 * of a trivia token.
 */
export function tokenValue(l: XyChartLex, i: number): string {
  const s = l.textStart[i] ?? -1;
  if (s < 0) return l.tokens.source.slice(l.tokens.start[i] ?? 0, l.tokens.end[i] ?? 0);
  return decodeEntities(l.v12.text.slice(s, Math.min(l.textEnd[i] ?? s, l.v12.length)));
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
