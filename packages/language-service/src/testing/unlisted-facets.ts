/**
 * First-party language facets whose package has no `mermaid` manifest yet, so
 * `gen:registry` gives their `firstPartyFacets` row no `load` (D89). The repository's own
 * specs (goldens, corpus property, rename round-trip) pass these rows to
 * `createLanguageService({ facets })` so the type's facet is tested before its integration
 * ticket lands. Test-only: not exported from `./testing`, not built.
 *
 * A row goes when the type's manifest gets a `language` entry: `goldens.spec.ts` fails while a
 * row here shadows a generated row that has a `load`.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import type { FacetEntry } from '../facets.ts';

const USECASE_LANGUAGE = '@mermaid-js/diagram-usecase/language';

export const UNLISTED_FACETS: readonly FacetEntry[] = [
  // Spec #517: the manifest comes with T5 (#567).
  {
    type: 'usecase',
    id: 'usecase',
    section: 'usecase',
    pattern: /^\s*usecase-beta(?:\s|$)/,
    detector: (text) => /^\s*usecase-beta(?:\s|$)/.test(text),
    // Until the manifest (#567) the package is no dependency of this one (#637), so the
    // specifier is not checked statically; T5 drops this row.
    load: () =>
      import(/* @vite-ignore */ USECASE_LANGUAGE).then(
        (m: { language: LanguageFacet }) => m.language
      ),
  },
];
