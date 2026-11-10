/**
 * The block parser's public surface: the parser, detection, and the lexer gated against v12's
 * jison lexer.
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as BlockTokenKind } from './tokens.ts';
export { MAX_SPACE_CELLS, MAX_SPAN } from './builder.ts';
export { parseBlock } from './parser.ts';
export type { BlockParseOptions, BlockParseResult } from './parser.ts';
export { detectBlock } from './detect.ts';
export type * from './ast.ts';

export interface BlockToken {
  /** A `BlockTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (`Lexed.text` in `./lexer.ts`). */
  text: string;
  range: Range;
}

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
  const { tokens } = lexed;
  const out: BlockToken[] = [];
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
