/** flowchart's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { startsWith, V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  flowchart: {
    probe: 'flowchart TD\n  A',
    e2e: ['flowchart'],
    smoke: false,
    harvest: {
      dir: `${V12_DIAGRAMS}/flowchart`,
      docs: 'flowchart.md',
      method: { kind: 'literals', header: startsWith('graph|flowchart') },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
