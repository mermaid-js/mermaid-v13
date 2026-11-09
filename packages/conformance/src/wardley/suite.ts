/** wardley's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { wardleyAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: wardleyAdapter,
    corpusDirs: ['e2e/diagrams/wardley'],
    // The cases run in `wardley/parity.spec.ts`, with their unclosed-directive divergences.
    corpusFiles: ['packages/conformance/corpus/wardley-v12-specs.json'],
  },
];
