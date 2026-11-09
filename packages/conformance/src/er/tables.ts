/** er's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  er: {
    probe: 'erDiagram\n  A',
    e2e: ['er-diagram'],
    smoke: false,
    harvest: {
      dir: `${V12_DIAGRAMS}/er`,
      docs: 'entityRelationshipDiagram.md',
      method: {
        kind: 'run',
        parsers: ['erDiagram'],
        specs: ['parser/erDiagram.spec.js', 'parser/subgraph.spec.js'],
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
