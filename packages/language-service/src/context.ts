/**
 * What every query of one snapshot reads (DESIGN §4.5): the text, its preprocess result, the
 * detected type and, when the type has a loaded facet, the parse with tokens. Feature modules
 * take this; later features (completion, hover, front-matter config) read the same fields.
 */
import type { AstNode, LanguageFacet, ParseResult } from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { FacetEntry } from './facets.ts';

export interface DocumentContext {
  readonly uri: string;
  readonly text: string;
  readonly pre: PreprocessResult;
  /** Offset of the diagram's first line (after front matter, blank lines and directives). */
  readonly start: number;
  /** The detected row; `undefined` for a type unknown to v12. */
  readonly entry: FacetEntry | undefined;
  readonly facet: LanguageFacet | undefined;
  /** The facet's parse (tokens kept); only with a facet. */
  readonly result: ParseResult<unknown, AstNode> | undefined;
  /** The JSON schema of the config, as passed to `createLanguageService` (D96). */
  readonly schema: Readonly<Record<string, unknown>> | undefined;
}
