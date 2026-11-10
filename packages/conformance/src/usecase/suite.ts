/** usecase's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { usecaseAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: usecaseAdapter,
    corpusDirs: ['e2e/diagrams/usecase'],
    // The cases run in `usecase/parity.spec.ts`, with their core divergences and offset checks.
    corpusFiles: ['packages/conformance/corpus/usecase-v12-specs.json'],
  },
];
