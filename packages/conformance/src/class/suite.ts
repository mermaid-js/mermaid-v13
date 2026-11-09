/** class's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { classAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: classAdapter,
    corpusDirs: ['e2e/diagrams/class-diagram'],
    corpusFiles: ['packages/conformance/corpus/class-v12-specs.json'],
  },
];
