/** c4's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { c4Adapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: c4Adapter,
    corpusDirs: ['e2e/diagrams/c4'],
    corpusFiles: [
      'packages/conformance/corpus/c4-v12-specs.json',
      'packages/conformance/corpus/c4-cases.json',
    ],
    // The gate variants run in `c4/parity.spec.ts`, with D452's lexing exclusions.
  },
];
