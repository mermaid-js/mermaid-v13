/** mindmap's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { mindmapParityCorpus } from './corpus.ts';
import { mindmapAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: mindmapAdapter,
    corpusDirs: ['e2e/diagrams/mindmap'],
    corpusFiles: [
      'packages/conformance/corpus/mindmap-v12-specs.json',
      'packages/conformance/corpus/mindmap-cases.json',
    ],
    corpus: mindmapParityCorpus,
  },
];
