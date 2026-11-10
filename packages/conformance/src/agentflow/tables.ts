/** agentflow's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  agentflow: {
    probe: 'agentflow-beta TB\n a',
    e2e: ['agentflow'],
    harvest: {
      dir: `${V12_DIAGRAMS}/agentflow`,
      docs: 'agentflow.md',
      // v12's 33 spec files but `conformance/conformance.spec.ts`, which reads `import.meta.url`
      // (a syntax error in the runner's function body) and its 8 fixture files. Six of the 32
      // add no source here, as they call no `agentflow.parse`: `containerOrder`
      // (`Diagram.fromText` in a helper), `conformance/runner` (`runFixture`), `renderer`
      // (`draw`), `agentflow-render-positions` and `agentflow-max-text-size` (`mermaidAPI` in
      // `jsdomIt` bodies, which the runner does not run) and `colorSlots` (no source). Their
      // sources and the 8 fixtures are cases in `corpus/agentflow-cases.json` (`v12-*`).
      method: {
        kind: 'run',
        parsers: ['agentflow'],
        specs: [
          'agentflow-diagnostics-lifecycle.spec.ts',
          'agentflow-diagnostics.spec.ts',
          'agentflow-link-style.spec.ts',
          'agentflow-max-text-size.spec.ts',
          'agentflow-render-positions.spec.ts',
          'agentflow-semantic-model.spec.ts',
          'agentflow-shape-catalogue.spec.ts',
          'colorSlots.spec.ts',
          'conformance/runner.spec.ts',
          'containerOrder.spec.ts',
          'diagnostics.spec.ts',
          'parser/agentflow-attachment-mapping.spec.ts',
          'parser/agentflow-blank-line-fold.spec.ts',
          'parser/agentflow-comments.spec.ts',
          'parser/agentflow-containment-cycle.spec.ts',
          'parser/agentflow-edge-instruction.spec.ts',
          'parser/agentflow-edge-semantic.spec.ts',
          'parser/agentflow-empty-metadata.spec.ts',
          'parser/agentflow-flow-metadata.spec.ts',
          'parser/agentflow-flow-self-reference.spec.ts',
          'parser/agentflow-flowchart-parity.spec.ts',
          'parser/agentflow-global.spec.ts',
          'parser/agentflow-inline-metadata-mapping.spec.ts',
          'parser/agentflow-mappings.spec.ts',
          'parser/agentflow-metadata-no-validation.spec.ts',
          'parser/agentflow-metadata-prototype-keys.spec.ts',
          'parser/agentflow-metadata-trailing-comma.spec.ts',
          'parser/agentflow-subgraph-span.spec.ts',
          'parser/agentflow-tool-validators.spec.ts',
          'parser/agentflow-yaml-error-position.spec.ts',
          'parser/agentflow.spec.ts',
          'renderer.spec.ts',
        ],
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
