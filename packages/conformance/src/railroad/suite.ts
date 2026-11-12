/** railroad's oracle parity suites (`PARITY_SUITES`, `src/registry.ts`): one per notation (D511). */
import type { ParitySuite } from '../corpus.ts';
import {
  railroadAbnfAdapter,
  railroadAdapter,
  railroadEbnfAdapter,
  railroadPegAdapter,
} from './v13.ts';

// Each suite runs over the one corpus and claims its own v12 type. The cases run in
// `railroad/parity.spec.ts`, with its unclosed-directive exclusion.
export const parity: readonly ParitySuite[] = [
  railroadAdapter,
  railroadEbnfAdapter,
  railroadAbnfAdapter,
  railroadPegAdapter,
].map((adapter) => ({
  adapter,
  corpusDirs: ['e2e/diagrams/railroad'],
  corpusFiles: ['packages/conformance/corpus/railroad-v12-specs.json'],
}));
