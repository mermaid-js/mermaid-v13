/** architecture's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { architectureAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: architectureAdapter,
    corpusDirs: ['e2e/diagrams/architecture'],
    // The cases run in `architecture/parity.spec.ts`, with D504's differences.
    corpusFiles: ['packages/conformance/corpus/architecture-v12-specs.json'],
  },
];
