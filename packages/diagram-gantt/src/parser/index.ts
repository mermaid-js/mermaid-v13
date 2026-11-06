/**
 * The gantt parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer (#377).
 */
import { cook, Kind, significantTokens, sourceView, TRIVIA } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as GanttTokenKind } from './tokens.ts';
export { parseGantt } from './parser.ts';
export type { GanttParseOptions, GanttParseResult } from './parser.ts';
export { detectGantt } from './detect.ts';
export type * from './ast.ts';

export interface GanttToken {
  /** A `GanttTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (entities, CRLF and removed spans applied). */
  text: string;
  range: Range;
}

/**
 * The significant gantt tokens of `src` (trivia left out), for editors and for the lexer-parity
 * gate.
 */
export function ganttTokens(src: string): GanttToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const t = significantTokens(lex(src, pre.bodyStart, view), TRIVIA);
  const out: GanttToken[] = [];
  for (let j = 0; j < t.length; j++) {
    const kind = t.kind[j] ?? Kind.EOF;
    if (kind === Kind.EOF) continue;
    const start = t.start[j] ?? 0;
    const end = t.end[j] ?? 0;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
