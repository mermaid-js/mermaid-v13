/** requirement's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { requirementAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: requirementAdapter,
    corpusDirs: ['e2e/diagrams/requirement'],
    // The gate's variants run in `requirement/parity.spec.ts`, against v12 with D431's and
    // D432's lexer rules (a blank before every line break is D431's case everywhere).
    corpusFiles: [
      'packages/conformance/corpus/requirement-v12-specs.json',
      'packages/conformance/corpus/requirement-cases.json',
    ],
  },
];
