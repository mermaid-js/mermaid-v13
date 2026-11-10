/** eventmodeling's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { eventModelingAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: eventModelingAdapter,
    corpusDirs: ['e2e/diagrams/eventmodeling'],
    // The cases run in `eventmodeling/parity.spec.ts`, with their listed divergences.
    corpusFiles: ['packages/conformance/corpus/eventmodeling-v12-specs.json'],
  },
];
