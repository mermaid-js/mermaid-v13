/** treemap's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { treemapAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: treemapAdapter,
    corpusDirs: ['e2e/diagrams/treemap'],
    // The cases run in `treemap/parity.spec.ts`, with its unclosed-directive exclusion (as pie's).
    corpusFiles: ['packages/conformance/corpus/treemap-v12-specs.json'],
  },
];
