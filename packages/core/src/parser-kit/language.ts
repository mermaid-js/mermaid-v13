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
import type { ProbeResult } from './probe.ts';
import type { ParseResult, SymbolOccurrence } from './result.ts';
import type { TokenKind } from './tokens.ts';

/** Options the service parses with: tokens are always kept; `probe` is the completion offset. */
export interface FacetParseOptions {
  keepTokens: true;
  /** UTF-16 offset to record expectations at (R-LANG-7, D95). */
  probe?: number;
}

/** What the facet's completion and hover read of a document (DESIGN §4.5). */
export interface DocumentView<A extends AstNode = AstNode> {
  /** The whole text; every range is a UTF-16 offset into it. */
  readonly text: string;
  /** The snapshot's parse of `text`: tokens kept, no probe. */
  readonly result: ParseResult<unknown, A>;
}

/** What is under the cursor for hover (D93). */
export interface HoverTarget {
  /** The hover offset. */
  readonly offset: number;
  /**
   * The token of `doc.result.tokens` under the offset (one containing it, else one ending at
   * it), when there is one that is not a blank or line break. Without one the facet may still
   * read the text (a keyword its lexer emits no token for).
   */
  readonly token?: { readonly kind: TokenKind; readonly range: Range };
  /** The parser's symbol occurrence under the offset, when there is one. */
  readonly symbol?: SymbolOccurrence;
}

/** One diagram type's language knowledge. */
export interface LanguageFacet<A extends AstNode = AstNode> {
  /** The diagram id, e.g. `flowchart`. */
  readonly id: string;
  /**
   * Parse the whole document `text` (front matter and directives included; every range is an
   * offset into it) with tokens kept, and record expectations at `options.probe` when given.
   *
   * Contract with the service:
   * - Diagnostics: the facet's own, in source order, N errors in, N out. Preprocess
   *   diagnostics (`YAML_*`, `INVALID_DIRECTIVE`, …) need not be repeated: the service merges
   *   `preprocess(text).diagnostics` in itself and drops one the facet also reports (same
   *   code and range), so a facet that already includes them (flowchart) is fine too.
   * - Never throws on any text. If it does, the service shows `LANGUAGE_FACET_FAILED` and
   *   serves generic features only for that text.
   * - Pure and synchronous: the same text gives the same result; nothing is kept between
   *   calls, and the service never mutates the result.
   */
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
  /**
   * Completion items at the probe (D95): `probe` is `ParseResult.probe` of a parse of
   * `doc.text` with `probe: offset`. Items are filtered by the probe's prefix.
   */
  completions(probe: ProbeResult, doc: DocumentView<A>): CompletionItem[];
  /** Hover for what is under the cursor (D93); keyword docs come from the syntax reference. */
  hover(at: HoverTarget, doc: DocumentView<A>): Hover | undefined;
}

/**
 * What a completion item is (D95, D96). Front matter uses `property` (a key) and `value`;
 * diagram text adds keywords, the user's ids (`node`, `subgraph`, `class`), `constant`s
 * (directions, link targets), `operator`s (arrows, `:::`, `&`) and `shape`s (bracket shapes,
 * shape names). Adapters map each to their editor's item kind.
 */
export type CompletionKind =
  | 'property'
  | 'value'
  | 'keyword'
  | 'node'
  | 'subgraph'
  | 'class'
  | 'constant'
  | 'operator'
  | 'shape';

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
