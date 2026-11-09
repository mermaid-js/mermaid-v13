/** sequence's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { sequenceAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: sequenceAdapter,
    corpusDirs: ['e2e/diagrams/sequence'],
    corpusFiles: [
      'packages/conformance/corpus/sequence-v12-specs.json',
      'packages/conformance/corpus/sequence-cases.json',
    ],
  },
];
