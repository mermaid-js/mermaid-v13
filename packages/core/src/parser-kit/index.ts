/**
 * Parser kit (DESIGN §4.2): building blocks for hand-written lexers and recursive-descent
 * parsers. There is no grammar abstraction. Nothing here holds module-level mutable state;
 * every stateful helper is an instance created per parse.
 */
export { FIRST_DIAGRAM_KIND, Kind, TokenWriter } from './tokens.ts';
export type { TokenKind, TokenStream } from './tokens.ts';
export {
  charTable,
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
export { LineIndex } from './positions.ts';
export type { Position, Range } from './positions.ts';
export { Diagnostics, ExpectedTable, formatExpected, MAX_EXPECTED } from './diagnostics.ts';
export type { Diagnostic, DiagnosticExtra, RelatedInfo, Severity } from './diagnostics.ts';
export { formatDiagnostic } from './format.ts';
export { inKindSet, kindSet, TokenCursor, TRIVIA } from './cursor.ts';
export type { KindSet } from './cursor.ts';
export { syncTo } from './recovery.ts';
export { AstIds, nodeId } from './ast.ts';
export type { AstCallback, AstId, AstNode } from './ast.ts';
export { ParseState } from './result.ts';
export type { ParseOptions, ParseResult, StatementSpan, SymbolOccurrence } from './result.ts';
