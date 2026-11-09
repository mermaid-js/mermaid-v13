/** radar's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { radarAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: radarAdapter,
    corpusDirs: ['e2e/diagrams/radar'],
    corpusFiles: ['packages/conformance/corpus/radar-v12-specs.json'],
  },
];
