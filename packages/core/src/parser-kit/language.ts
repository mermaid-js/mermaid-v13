/**
 * The language facet (DESIGN §4.5, R-LANG-8, D89): what a diagram package exports from its
 * `./language` subpath so the language service can support that type. It is built on parser
 * kit outputs only and imports no renderer code.
 *
 * It lives here, not in `@mermaid-js/language-service`, because diagram packages import only
 * core (DESIGN §2); the service re-exports it.
 */
import type { AstNode } from './ast.ts';
import type { TokenCategory } from './categories.ts';
import type { ParseResult } from './result.ts';
import type { TokenKind } from './tokens.ts';

/** Options the service parses with: tokens are always kept; `probe` is the completion offset. */
export interface FacetParseOptions {
  keepTokens: true;
  /** UTF-16 offset to record expectations at (R-LANG-7, D95). */
  probe?: number;
}

/**
 * One diagram type's language knowledge.
 *
 * `completions` and `hover` (D93, D95) join this interface with the completion/hover ticket,
 * together with the `Probe` and document view types they take.
 */
export interface LanguageFacet<A extends AstNode = AstNode> {
  /** The diagram id, e.g. `flowchart`. */
  readonly id: string;
  /** Parse with tokens kept. */
  parse(text: string, options: FacetParseOptions): ParseResult<unknown, A>;
  /** Highlight category of every token kind the parser emits (D94). */
  readonly categories: Readonly<Record<TokenKind, TokenCategory>>;
  /**
   * Symbol kinds that share one name space: an occurrence's definition, references and
   * rename cover every kind in its group (D92).
   */
  readonly namespaces: readonly (readonly string[])[];
  /** `undefined` when `name` can be used as an identifier, else the reason it cannot (D92). */
  isValidId(name: string): string | undefined;
}
