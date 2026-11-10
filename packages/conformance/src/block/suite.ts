/** block's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`, #554). */
import type { ParitySuite } from '../corpus.ts';
import { blockParityCorpus } from './corpus.ts';
import { blockAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: blockAdapter,
    corpusDirs: ['e2e/diagrams/block'],
    corpusFiles: [
      'packages/conformance/corpus/block-v12-specs.json',
      'packages/conformance/corpus/block-cases.json',
    ],
    corpus: blockParityCorpus,
  },
];
