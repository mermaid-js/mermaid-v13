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
import type { Range } from './positions.ts';
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
  /**
   * `undefined` when `name` can be used as an identifier of symbol kind `kind` (a kind the
   * parser records, e.g. `node`, `class`, `edge`; the facet's main id kind when omitted),
   * else the reason it cannot (D92).
   */
  isValidId(name: string, kind?: string): string | undefined;
}

/**
 * What a completion item is (D95, D96). Front matter uses `property` (a key) and `value`; the
 * facet completions (#32) extend this union with their own kinds.
 */
export type CompletionKind = 'property' | 'value' | 'keyword';

/** One completion item (D95, D96). Editor-agnostic; adapters map it to their own type. */
export interface CompletionItem {
  /** What the list shows, and what filtering matches against. */
  readonly label: string;
  readonly kind: CompletionKind;
  /** The text that replaces `range`. */
  readonly insertText: string;
  /** The text the item replaces: the word being typed (empty at a fresh position). */
  readonly range: Range;
  /** One short line next to the label (the type, `default`). */
  readonly detail?: string;
  /** Markdown shown for the selected item. */
  readonly documentation?: string;
}

/** Hover contents (D93, D96): markdown for the range it describes. */
export interface Hover {
  readonly range: Range;
  /** Markdown. */
  readonly contents: string;
}
