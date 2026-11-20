/**
 * The lean view of a parse result (DESIGN §4.2): what `mermaid` keeps of a parse for drawing.
 * Its own module, so the API takes it without the parse state.
 */
import type { AstNode } from './ast.ts';
import type { LeanParseResult, ParseResult } from './result.ts';

/**
 * `result` itself when it is lean; else a lean result with the same model, diagnostics,
 * `embeds` and `edgeCount`, which holds nothing of the AST, symbols, statements or tokens.
 */
export function leanOf<M>(
  result: ParseResult<M, AstNode> | LeanParseResult<M>
): LeanParseResult<M> {
  if (result.lean) return result;
  const { model, diagnostics, embeds, edgeCount } = result;
  return { lean: true, model, diagnostics, embeds, edgeCount };
}
