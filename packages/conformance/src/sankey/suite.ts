/** sankey's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { sankeyParityCorpus } from './corpus.ts';
import { sankeyAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: sankeyAdapter,
    corpusDirs: ['e2e/diagrams/sankey'],
    corpusFiles: [
      'packages/conformance/corpus/sankey-v12-specs.json',
      'packages/conformance/corpus/sankey-cases.json',
    ],
    corpus: sankeyParityCorpus,
  },
];
