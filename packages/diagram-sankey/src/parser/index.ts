/**
 * The sankey parser's public surface: the lexer gated against v12's jison lexer (the parser
 * and detection follow in #496).
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as SankeyTokenKind } from './tokens.ts';

export interface SankeyToken {
  /** A `SankeyTokenKind` or a shared `Kind` (`Newline`, `Error`). */
  kind: number;
  /** The token's text as v12's lexer matched it (`Lexed.text` in `./lexer.ts`). */
  text: string;
  range: Range;
}

/**
 * The significant sankey tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function sankeyTokens(src: string): SankeyToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const lexed = lex(src, pre.bodyStart, view);
  const { tokens } = lexed;
  const out: SankeyToken[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    if (
      kind === Kind.Comment ||
      kind === Kind.Directive ||
      kind === Kind.Space ||
      kind === Kind.EOF
    )
      continue;
    const range = { start: tokens.start[j] ?? 0, end: tokens.end[j] ?? 0 };
    out.push({ kind, text: lexed.text(j), range });
  }
  return out;
}
