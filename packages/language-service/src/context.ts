/**
 * What every query of one snapshot reads (DESIGN §4.5): the text, its preprocess result, the
 * detected type and, when the type has a loaded facet, the parse with tokens. Feature modules
 * take this; later features (completion, hover, front-matter config) read the same fields.
 */
import type {
  AstNode,
  EmbeddedBlock,
  LanguageFacet,
  ParseResult,
} from '@mermaid-js/core/parser-kit';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { ConfigSchema } from './config/schema.ts';
import type { FacetEntry } from './facets.ts';
import type { DocumentSnapshot } from './snapshot.ts';

/**
 * A diagram embedded in this one (ADR-15): the host's block and its body read as a document of
 * its own type, without the body's common indentation (D633). The document's ranges are offsets
 * into that text; {@link outer} places them in the host's text.
 */
export interface EmbeddedDocument {
  readonly block: EmbeddedBlock;
  /** Undefined for a block nested deeper than the render allows: it is not read. */
  readonly doc: DocumentSnapshot | undefined;
  /** Where offset `at` of the document's text is in the host's text. */
  readonly outer: (at: number) => number;
}

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
  /** Why the facet's parse threw, when it did (`facet` is then undefined). */
  readonly parseError: string | undefined;
  /** Why the detected type's facet could not be loaded, when it could not. */
  readonly loadError: string | undefined;
  /** The detected type has a facet to load, but `preload` has not loaded it (D155). */
  readonly notLoaded: boolean;
  /**
   * Every loaded facet, once each, when no type is detected: an empty document or a header
   * being typed gets each facet's header keywords (D95). Empty when a type is detected.
   */
  readonly available: readonly LanguageFacet[];
  /**
   * The config JSON schema (D96): the one passed to `createLanguageService`, else the
   * generated one once `preload` has loaded it.
   */
  readonly schema: ConfigSchema | undefined;
  /**
   * The blocks the parse lists (ADR-15), each read as its own document, in source order;
   * empty for a text without blocks.
   */
  readonly embeds: readonly EmbeddedDocument[];
}
