/** timeline's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { timelineAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: timelineAdapter,
    corpusDirs: ['e2e/diagrams/timeline'],
    corpusFiles: [
      'packages/conformance/corpus/timeline-v12-specs.json',
      'packages/conformance/corpus/timeline-cases.json',
    ],
  },
];
