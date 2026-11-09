/** gantt's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { ganttAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: ganttAdapter,
    corpusDirs: ['e2e/diagrams/gantt'],
    corpusFiles: [
      'packages/conformance/corpus/gantt-v12-specs.json',
      'packages/conformance/corpus/gantt-cases.json',
    ],
  },
];
