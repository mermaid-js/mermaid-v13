/**
 * `@mermaid-js/diagram-railroad/testing`: what the conformance gates read and a render never
 * does (as wardley's): v12's Langium token names per notation, the token streams and their
 * trivia set, and each notation's kinds and kind → category table (for the highlighting
 * agreement, until the language facet, T6, carries them), the layout invariants, and the render
 * harness (`renderRailroadForTest`, as venn's) that renders through the plugin alone, without
 * the registry. They live outside the runtime entry, so the chunk mermaid loads for a railroad
 * render stays small (D217).
 */
export { LANGIUM_HIDDEN, LANGIUM_NAMES } from './parser/langium-names.ts';
export {
  LEXERS,
  RAILROAD_TRIVIA,
  RailroadTokenKind,
  railroadTokens,
  railroadView,
} from './parser/index.ts';
export type { RailroadNotation, RailroadToken, RailroadView } from './parser/index.ts';
export { AbnfKind, EbnfKind, IrKind, NOTATION_KINDS, PegKind } from './parser/tokens.ts';
export { railroadCategories } from './generated/categories.ts';
export { railroadEbnfCategories } from './generated/railroad-ebnf.categories.ts';
export { railroadAbnfCategories } from './generated/railroad-abnf.categories.ts';
export { railroadPegCategories } from './generated/railroad-peg.categories.ts';
export { railroadLayoutViolations, RAILROAD_METRICS } from './layout/index.ts';
export { railroadSectionOf } from './config.ts';
export { renderRailroadForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedRailroad, RenderRailroadOptions } from './render/harness.ts';
