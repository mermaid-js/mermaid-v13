/**
 * The requirement parser's public surface: the parser, detection, and the lexer gated against
 * v12's jison lexer.
 */
import { TRIVIA } from '@mermaid-js/core/parser-kit';
import { keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex, requirementView } from './lexer.ts';

export { JISON_NAMES, T as RequirementTokenKind } from './tokens.ts';
export { parseRequirement } from './parser.ts';
export type { RequirementParseOptions, RequirementParseResult } from './parser.ts';
export { detectRequirement } from './detect.ts';
export type {
  At,
  BuilderOptions,
  DefAt,
  ElementFields,
  Ref,
  RequirementFields,
} from './builder.ts';
export type * from './ast.ts';

/** A token of this diagram: its `kind` is a `RequirementTokenKind` or a shared `Kind`. */
export type RequirementToken = SeenToken;

/**
 * The significant requirement tokens of `src` (trivia left out), for editors and for the
 * lexer-parity gate.
 */
export function requirementTokens(src: string): RequirementToken[] {
  const { from, view } = requirementView(src);
  const lexed = lex(src, from, view);
  return keptTokens(lexed.tokens, TRIVIA, (j) => lexed.text(j));
}
