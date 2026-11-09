/** gitgraph's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { gitGraphAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: gitGraphAdapter,
    corpusDirs: ['e2e/diagrams/git'],
    corpusFiles: [
      'packages/conformance/corpus/gitGraph-v12-specs.json',
      'packages/conformance/corpus/gitGraph-cases.json',
    ],
  },
];
