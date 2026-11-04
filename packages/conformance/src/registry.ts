import { classAdapter } from './class/v13.ts';
import type { ParitySuite } from './corpus.ts';
import { flowchartAdapter } from './flowchart/v13.ts';

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
    adapter: classAdapter,
    corpusDirs: ['e2e/diagrams/class-diagram'],
    corpusFiles: ['packages/conformance/corpus/class-v12-specs.json'],
  },
];

/** The committed divergence list (R-COMPAT-4). */
export const DIVERGENCES_FILE = new URL('../divergences.json', import.meta.url);
