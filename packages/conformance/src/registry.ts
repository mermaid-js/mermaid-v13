import type { ParitySuite } from './corpus.ts';
import { flowchartAdapter } from './flowchart/v13.ts';
import { sequenceAdapter } from './sequence/v13.ts';

/**
 * The diagrams under oracle parity. Each first-party diagram ticket adds its suite here, e.g.
 * `{ adapter: flowchartAdapter, corpusDirs: ['e2e/diagrams/flowchart'] }` (ticket #8).
 */
export const PARITY_SUITES: ParitySuite[] = [
  {
    adapter: flowchartAdapter,
    corpusDirs: ['e2e/diagrams/flowchart'],
    corpusFiles: ['packages/conformance/corpus/flowchart-v12-specs.json'],
  },
  {
    adapter: sequenceAdapter,
    corpusDirs: ['e2e/diagrams/sequence'],
    corpusFiles: [
      'packages/conformance/corpus/sequence-v12-specs.json',
      'packages/conformance/corpus/sequence-cases.json',
    ],
  },
];

/** The committed divergence list (R-COMPAT-4). */
export const DIVERGENCES_FILE = new URL('../divergences.json', import.meta.url);
