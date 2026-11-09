/**
 * The railroad language facet's four rows (D511), one per v12 type, each loading the one facet
 * (`@mermaid-js/diagram-railroad/language`, #616). Until T5 (#615) gives the package its
 * manifest, `gen:registry` writes these types' `firstPartyFacets` rows without a `load`, and
 * `packages/language-service` cannot import the package (it is no dependency there before the
 * manifest, #640). So the railroad language specs run here, in conformance, which depends on
 * every diagram package from its T1 on: they pass these rows to `createLanguageService`.
 *
 * T5 drops this file once the generated rows have their `load` (`language-goldens.spec.ts`
 * fails then): the goldens move to `packages/language-service/goldens/railroad/`, and the specs
 * here use the service's own rows.
 */
import type { FacetEntry } from '@mermaid-js/language-service';
import { RAILROAD_HEADERS } from '@mermaid-js/diagram-railroad';

const row = (type: string, header: string): FacetEntry => {
  // v12's detector patterns (case-insensitive, no boundary).
  const pattern = new RegExp(`^\\s*${header}`, 'i');
  return {
    type,
    id: 'railroad',
    section: 'railroad',
    pattern,
    detector: (text) => pattern.test(text),
    load: () => import('@mermaid-js/diagram-railroad/language').then((m) => m.language),
  };
};

/** The four types' rows, in v12's detector order. */
export const RAILROAD_FACETS: readonly FacetEntry[] = RAILROAD_HEADERS.map(([type, header]) =>
  row(type, header)
);
