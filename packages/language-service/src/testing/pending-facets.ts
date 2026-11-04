/**
 * First-party facets whose package manifest has no `language` entry yet, for the specs that
 * run the goldens. State (#151) is here until its manifest lands (#148 T5); then the generated
 * `stateDiagram` row serves it and its row here goes. Not part of `./testing`.
 */
import { stateLanguage } from '@mermaid-js/diagram-state/language';
import type { FacetEntry } from '../facets.ts';

export const PENDING_FACETS: readonly FacetEntry[] = [
  {
    type: 'stateDiagram',
    id: 'state',
    detector: (text) => /^\s*stateDiagram/.test(text),
    facet: stateLanguage,
  },
];
