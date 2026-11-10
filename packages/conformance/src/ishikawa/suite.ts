/** ishikawa's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { ishikawaParityCorpus } from './corpus.ts';
import { ishikawaAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: ishikawaAdapter,
    corpusDirs: ['e2e/diagrams/ishikawa'],
    corpusFiles: [
      'packages/conformance/corpus/ishikawa-v12-specs.json',
      'packages/conformance/corpus/ishikawa-cases.json',
    ],
    corpus: ishikawaParityCorpus,
  },
];
