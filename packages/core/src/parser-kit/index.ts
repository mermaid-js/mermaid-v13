/**
 * Parser kit (DESIGN §4.2): building blocks for hand-written lexers and recursive-descent
 * parsers. There is no grammar abstraction. Nothing here holds module-level mutable state;
 * every stateful helper is an instance created per parse.
 */
export { FIRST_DIAGRAM_KIND, Kind, tokenText, TokenWriter } from './tokens.ts';
export type { TokenKind, TokenStream } from './tokens.ts';
export { kindCategories, SHARED_CATEGORIES, TOKEN_CATEGORIES } from './categories.ts';
export type { TokenCategory } from './categories.ts';
export {
  charTable,
  codePointEnd,
  hasClass,
  isBlank,
  isDigit,
  isHex,
  isLetter,
  isLineEnd,
  isSpace,
  isUnicodeLetter,
  isWord,
} from './chars.ts';
export * from './char-codes.ts';
export { execAt, lineEnd, matchAt, newlineAt, scanWhile } from './scanner.ts';
export { closingLine, endsInBrace, openerBrace } from './embed-block.ts';
export { MAX_BLOCK_DEPTH, noDiagramType, openerRange, tooDeep } from './embed-depth.ts';
export { LineIndex } from './positions.ts';
export type { Position, Range } from './positions.ts';
export { Diagnostics, ExpectedTable, formatExpected, MAX_EXPECTED } from './diagnostics.ts';
export type { Diagnostic, DiagnosticExtra, RelatedInfo, Severity } from './diagnostics.ts';
export { formatDiagnostic } from './format.ts';
export { inKindSet, kindSet, ProbeCursor, TokenCursor, TRIVIA } from './cursor.ts';
export { Probe } from './probe.ts';
export type { ProbeResult } from './probe.ts';
export type { KindSet } from './cursor.ts';
export { syncTo } from './recovery.ts';
export { significantTokens, skipTo } from './view.ts';
export type { TokenView } from './view.ts';
export { AstIds, NO_AST_ID, nodeId } from './ast.ts';
export type { AstCallback, AstId, AstMenu, AstNode } from './ast.ts';
export { leanOf } from './lean.ts';
export { ParseState } from './result.ts';
export type {
  EmbeddedBlock,
  LeanParseOptions,
  LeanParseResult,
  ParseOptions,
  ParseOutput,
  ParseResult,
  StatementSpan,
  SymbolOccurrence,
} from './result.ts';
export {
  cook,
  DROP,
  firstHole,
  localOffset,
  QUOTE,
  SourceOffsets,
  sourceView,
} from './source-view.ts';
export type { Hole, SourceView, SourceViewOptions } from './source-view.ts';
export type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  FacetParseOptions,
  Hover,
  HoverTarget,
  LanguageFacet,
  NameSyntax,
} from './language.ts';
export { Stop, STOP } from './stop.ts';
