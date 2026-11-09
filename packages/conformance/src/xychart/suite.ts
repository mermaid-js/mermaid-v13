/** xychart's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { xyChartParityCorpus } from './corpus.ts';
import { xyChartAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: xyChartAdapter,
    corpusDirs: ['e2e/diagrams/xychart'],
    corpusFiles: [
      'packages/conformance/corpus/xychart-v12-specs.json',
      'packages/conformance/corpus/xychart-cases.json',
      'packages/conformance/corpus/xychart-recovery.json',
    ],
    corpus: xyChartParityCorpus,
  },
];
