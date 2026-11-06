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
import type { FacetEntry } from '../facets.ts';

export const UNLISTED_FACETS: readonly FacetEntry[] = [
  // Spec #421: the manifest comes with T5 (#462).
  {
    type: 'packet',
    id: 'packet',
    section: 'packet',
    detector: (text) => /^\s*packet(-beta)?/.test(text),
    load: () => import('@mermaid-js/diagram-packet/language').then((m) => m.language),
  },
];
