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
import { detectXyChart } from '@mermaid-js/diagram-xychart';
import type { FacetEntry } from '../facets.ts';

export const UNLISTED_FACETS: readonly FacetEntry[] = [
  // Spec #426: the manifest comes with T5 (#513).
  {
    type: 'xychart',
    id: 'xychart',
    section: 'xychart',
    // v12's pattern, as the registry row has it; the detector is the package's own.
    pattern: /^\s*xychart(-beta)?/,
    detector: (text) => detectXyChart(text),
    load: () => import('@mermaid-js/diagram-xychart/language').then((m) => m.language),
  },
];
