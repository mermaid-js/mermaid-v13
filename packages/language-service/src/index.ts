/**
 * `@mermaid-js/language-service` (DESIGN §4.5, R-LANG-1, D88): a pure, editor-agnostic Mermaid
 * language service built on parser kit outputs. Zero runtime dependencies: core and the
 * diagram packages are peers, and each diagram's `./language` facet is loaded by `preload`.
 *
 * ```ts
 * const service = createLanguageService();
 * await service.preload();             // load the facets first (D155)
 * const doc = service.update(uri, text);   // synchronous, always complete
 * doc.diagnostics(); doc.definition(offset); doc.rename(offset, 'B');
 * ```
 *
 * All positions are UTF-16 offsets into the full text; adapters convert with `LineIndex`.
 */
export { createLanguageService } from './service.ts';
export type { LanguageService, LanguageServiceOptions, PreloadRequest } from './service.ts';
export type { DocumentSnapshot } from './snapshot.ts';
export type { FacetEntry } from './facets.ts';
export type { Annotation, ConfigSchema, SchemaNode } from './config/schema.ts';
export { diagnosticMessage } from './diagnostics.ts';
export { firstPartyFacets } from './generated/facets.gen.ts';
export type { FoldingRange } from './folding.ts';
export { encodeSemanticTokens, lineFoldingRanges, lineSemanticTokens } from './lines.ts';
export type { LineFoldingRange, LineSemanticToken, LineSemanticTokenOptions } from './lines.ts';
export { SEMANTIC_TOKEN_LEGEND } from './semantic-tokens.ts';
export type { SemanticToken, SemanticTokenModifier, SemanticTokenType } from './semantic-tokens.ts';
export type { PrepareRenameResult, RenameResult, TextEdit } from './symbols.ts';
export { LineIndex } from '@mermaid-js/core/parser-kit';
/**
 * Everything a facet author needs (R-LANG-3): the `LanguageFacet` contract and the parser kit
 * types its `parse`, `completions` and `hover` take and give. Write the facet against these;
 * the parser itself is built with `@mermaid-js/core/parser-kit`.
 */
export type {
  AstId,
  AstNode,
  CompletionItem,
  CompletionKind,
  Diagnostic,
  DocumentView,
  FacetParseOptions,
  Hover,
  HoverTarget,
  LanguageFacet,
  ParseResult,
  Position,
  ProbeResult,
  Range,
  RelatedInfo,
  Severity,
  StatementSpan,
  SymbolOccurrence,
  TokenCategory,
  TokenKind,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
