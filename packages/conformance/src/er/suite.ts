/** er's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { erAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: erAdapter,
    corpusDirs: ['e2e/diagrams/er-diagram'],
    corpusFiles: ['packages/conformance/corpus/er-v12-specs.json'],
  },
];
