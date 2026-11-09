/** quadrant's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { quadrantParityCorpus } from './corpus.ts';
import { quadrantAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: quadrantAdapter,
    corpusDirs: ['e2e/diagrams/quadrant-chart'],
    corpusFiles: [
      'packages/conformance/corpus/quadrant-v12-specs.json',
      'packages/conformance/corpus/quadrant-cases.json',
    ],
    corpus: quadrantParityCorpus,
  },
];
