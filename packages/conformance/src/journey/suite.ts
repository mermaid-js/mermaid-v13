/** journey's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { journeyAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: journeyAdapter,
    corpusDirs: ['e2e/diagrams/journey'],
    corpusFiles: ['packages/conformance/corpus/journey-v12-specs.json'],
  },
];
