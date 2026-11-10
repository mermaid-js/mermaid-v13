/** kanban's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { kanbanParityCorpus } from './corpus.ts';
import { kanbanAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: kanbanAdapter,
    corpusDirs: ['e2e/diagrams/kanban'],
    corpusFiles: [
      'packages/conformance/corpus/kanban-v12-specs.json',
      'packages/conformance/corpus/kanban-cases.json',
    ],
    corpus: kanbanParityCorpus,
  },
];
