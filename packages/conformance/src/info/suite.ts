/** info's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { infoAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: infoAdapter,
    corpusDirs: ['e2e/diagrams/info'],
    corpusFiles: ['packages/conformance/corpus/info-v12-specs.json'],
  },
];
