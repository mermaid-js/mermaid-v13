/** pie's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { pieAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: pieAdapter,
    corpusDirs: ['e2e/diagrams/pie'],
    corpusFiles: ['packages/conformance/corpus/pie-v12-specs.json'],
  },
];
