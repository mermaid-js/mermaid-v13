/**
 * `@mermaid-js/diagram-requirement`: the requirement diagram plugin (spec #520). The lexer is
 * here; the parser, model, layout, renderer, plugin export and manifest land with the other
 * tickets of that spec.
 */
export {
  JISON_NAMES,
  RequirementTokenKind,
  requirementTokens,
  requirementView,
} from './parser/index.ts';
export type { RequirementToken } from './parser/index.ts';
