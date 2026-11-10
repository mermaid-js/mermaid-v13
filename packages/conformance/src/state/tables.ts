// cspell:words unput
/** state's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { startsWith, V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  state: {
    probe: 'stateDiagram-v2\n  A',
    // Its `processId` action calls `yy.lexer.unput`.
    yy: ({ db, lexer }) => Object.assign(new (db.constructor as new () => object)(), { lexer }),
    e2e: ['state-diagram', 'state-diagram-v2'],
    smoke: false,
    harvest: {
      dir: `${V12_DIAGRAMS}/state`,
      docs: 'stateDiagram.md',
      method: { kind: 'literals', header: startsWith('stateDiagram') },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
