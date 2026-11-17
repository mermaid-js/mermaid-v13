/**
 * The ishikawa parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import { sourceView, TRIVIA } from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as IshikawaTokenKind } from './tokens.ts';
export { parseIshikawa } from './parser.ts';
export type { IshikawaParseOptions, IshikawaParseResult } from './parser.ts';
export { detectIshikawa } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is an `IshikawaTokenKind` or a shared `Kind`. */
export type IshikawaToken = SeenToken;

/**
 * Where the ishikawa body of `src` starts and its source view (what v12's preprocessing
 * removed and rewrote), as {@link lex} takes them.
 */
export function ishikawaView(src: string): { from: number; view: SourceView } {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { from: pre.bodyStart, view };
}

/**
 * The significant ishikawa tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function ishikawaTokens(src: string): IshikawaToken[] {
  const { from, view } = ishikawaView(src);
  const lexed = lex(src, from, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
