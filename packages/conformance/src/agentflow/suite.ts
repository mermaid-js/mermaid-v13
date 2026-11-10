/** agentflow's oracle parity suite (`PARITY_SUITES`, `src/registry.ts`). */
import type { ParitySuite } from '../corpus.ts';
import { agentflowAdapter } from './v13.ts';

export const parity: readonly ParitySuite[] = [
  {
    adapter: agentflowAdapter,
    corpusDirs: ['e2e/diagrams/agentflow'],
    // The gate's generated variants run in `agentflow/parity.spec.ts`, with their exclusions.
    corpusFiles: [
      'packages/conformance/corpus/agentflow-v12-specs.json',
      'packages/conformance/corpus/agentflow-cases.json',
    ],
  },
];
