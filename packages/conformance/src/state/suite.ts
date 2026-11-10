/** state's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { stateAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: stateAdapter,
    corpusDirs: ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2'],
    corpusFiles: ['packages/conformance/corpus/state-v12-specs.json'],
  },
];
