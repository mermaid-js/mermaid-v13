/**
 * `@mermaid-js/language-service` (DESIGN §4.5, R-LANG-1, D88): a pure, editor-agnostic Mermaid
 * language service built on parser kit outputs. Zero runtime dependencies: core and the
 * diagram packages are peers, and each diagram's `./language` facet is loaded on first use.
 *
 * ```ts
 * const service = createLanguageService();
 * let doc = service.update(uri, text);
 * doc = (await doc.pending) ?? doc;   // first use of a diagram type loads its facet
 * doc.diagnostics(); doc.definition(offset); doc.rename(offset, 'B');
 * ```
 *
 * All positions are UTF-16 offsets into the full text; adapters convert with `LineIndex`.
 */
export { createLanguageService } from './service.ts';
export type { LanguageService, LanguageServiceOptions } from './service.ts';
export { DocumentSnapshot } from './snapshot.ts';
export type { DocumentContext } from './context.ts';
export type { FacetEntry } from './facets.ts';
export { firstPartyFacets } from './generated/facets.gen.ts';
export type { FoldingRange } from './folding.ts';
export { SEMANTIC_TOKEN_LEGEND } from './semantic-tokens.ts';
export type { SemanticToken, SemanticTokenModifier, SemanticTokenType } from './semantic-tokens.ts';
export type { PrepareRenameResult, RenameResult, TextEdit } from './symbols.ts';
export { LineIndex } from '@mermaid-js/core/parser-kit';
export type {
  AstId,
  AstNode,
  Diagnostic,
  FacetParseOptions,
  LanguageFacet,
  Position,
  Range,
  Severity,
  TokenCategory,
} from '@mermaid-js/core/parser-kit';
