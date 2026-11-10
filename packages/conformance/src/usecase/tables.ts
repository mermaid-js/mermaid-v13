/** usecase's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  usecase: {
    header: 'usecase-beta',
    files: [
      'packages/mermaid/src/diagrams/usecase/usecase.parser.spec.ts',
      'packages/mermaid/src/diagrams/usecase/usecase.spec.ts',
      'packages/mermaid/src/diagrams/usecase/parser/usecase.parser.spec.ts',
      'packages/mermaid/src/diagrams/usecase/parser/usecase.lexer.spec.ts',
      'packages/mermaid/src/diagrams/usecase/parser/usecaseJson.spec.ts',
      'packages/mermaid/src/diagrams/usecase/usecaseDb.spec.ts',
      'packages/mermaid/src/diagrams/usecase/usecase-colorIndex.spec.ts',
      'packages/mermaid/src/diagrams/usecase/usecaseRenderer.spec.ts',
      'packages/mermaid/src/config.appearance.spec.ts',
      'packages/examples/src/examples/usecase.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/usecase.md',
  },
} satisfies Record<string, Harvest>;
