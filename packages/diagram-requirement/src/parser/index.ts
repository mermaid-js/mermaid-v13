/**
 * The requirement parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { lex, requirementView } from './lexer.ts';

export { JISON_NAMES, T as RequirementTokenKind } from './tokens.ts';
export { requirementView } from './lexer.ts';
export { parseRequirement } from './parser.ts';
export type { RequirementParseOptions, RequirementParseResult } from './parser.ts';
export { detectRequirement } from './detect.ts';
export { RequirementBuilder } from './builder.ts';
export type {
  At,
  BuilderOptions,
  DefAt,
  ElementFields,
  Ref,
  RequirementFields,
} from './builder.ts';
export type * from './ast.ts';

export interface RequirementToken {
  /** A `RequirementTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (`Lexed.text` in `./lexer.ts`). */
  text: string;
  range: Range;
}

/**
 * The significant requirement tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function requirementTokens(src: string): RequirementToken[] {
  const { from, view } = requirementView(src);
  const lexed = lex(src, from, view);
  const { tokens } = lexed;
  const out: RequirementToken[] = [];
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
