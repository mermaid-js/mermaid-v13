/** cynefin's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { cynefinAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: cynefinAdapter,
    corpusDirs: ['e2e/diagrams/cynefin'],
    corpusFiles: ['packages/conformance/corpus/cynefin-v12-specs.json'],
  },
];
