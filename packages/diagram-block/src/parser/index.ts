/**
 * The block parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { sourceView, TRIVIA } from '@mermaid-js/core/parser-kit';
import type { SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as BlockTokenKind } from './tokens.ts';
export { MAX_SPACE_CELLS, MAX_SPAN } from './builder.ts';
export { parseBlock } from './parser.ts';
export type { BlockParseOptions, BlockParseResult } from './parser.ts';
export { detectBlock } from './detect.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `BlockTokenKind` or a shared `Kind`. */
export type BlockToken = SeenToken;

/**
 * Where the block body of `src` starts and its source view (what v12's preprocessing removed
 * and rewrote), as {@link lex} takes them.
 */
export function blockView(src: string): { from: number; view: SourceView } {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  return { from: pre.bodyStart, view };
}

/**
 * The significant block tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function blockTokens(src: string): BlockToken[] {
  const { from, view } = blockView(src);
  const lexed = lex(src, from, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
