/** treeView's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { treeViewAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: treeViewAdapter,
    corpusDirs: ['e2e/diagrams/tree-view'],
    // The cases run in `treeView/parity.spec.ts`, with its unclosed-directive exclusion (as pie's).
    corpusFiles: ['packages/conformance/corpus/treeView-v12-specs.json'],
  },
];
