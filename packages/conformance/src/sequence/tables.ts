/** sequence's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { startsWith, V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  sequence: {
    probe: 'sequenceDiagram\n  A->>B: x',
    e2e: ['sequence'],
    smoke: false,
    harvest: {
      dir: `${V12_DIAGRAMS}/sequence`,
      docs: 'sequenceDiagram.md',
      method: { kind: 'literals', header: startsWith('sequenceDiagram') },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
