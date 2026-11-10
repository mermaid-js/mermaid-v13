/** packet's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { packetAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: packetAdapter,
    corpusDirs: ['e2e/diagrams/packet'],
    // The cases run in `packet/parity.spec.ts`, with its unclosed-directive exclusion (as pie's).
    corpusFiles: ['packages/conformance/corpus/packet-v12-specs.json'],
  },
];
