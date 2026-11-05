/**
 * Facet table rows (DESIGN §4.5, D89). The generated `firstPartyFacets` lists every v12 type
 * in detector order; a row with a `load` has a v13 language facet. Third-party rows are passed
 * to `createLanguageService({ facets })` and may carry the facet itself.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';

export interface FacetEntry {
  /** The v12 diagram type (`flowchart-v2`), as detection reports it. */
  readonly type: string;
  /** The diagram id (`flowchart`); the type itself for a v12 type with no package yet. */
  readonly id: string;
  /**
   * First-party rows: the config section the renderer reads for this type (the package id,
   * as mermaid's registry gives it); absent for a type with no v13 package. Third-party rows
   * leave it out: their section is their `id`, as for a registered plugin.
   */
  readonly section?: string;
  /**
   * First-party rows: v12's detector regex, which `detector` tests (editors that cannot run
   * `detector`, such as Monaco's Monarch tokenizer, derive their dispatch from it).
   */
  readonly pattern?: RegExp;
  /**
   * First-party rows: run on the text from the diagram's first line. Third-party rows: the
   * cleaned text (directives and `%%` comments removed) and the front-matter config, as v12.
   */
  detector(text: string, config?: Readonly<Record<string, unknown>>): boolean;
  /** Imports the facet; absent when the type has no language support yet. */
  readonly load?: () => Promise<LanguageFacet>;
  /** The facet itself, already loaded (third-party hosts that bundle it). */
  readonly facet?: LanguageFacet;
}
