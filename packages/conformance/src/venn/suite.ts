/** venn's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { vennParityCorpus } from './corpus.ts';
import { vennAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: vennAdapter,
    corpusDirs: ['e2e/diagrams/venn'],
    corpusFiles: [
      'packages/conformance/corpus/venn-v12-specs.json',
      'packages/conformance/corpus/venn-cases.json',
    ],
    corpus: vennParityCorpus,
  },
];
