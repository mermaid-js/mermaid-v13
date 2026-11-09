/** kanban's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  kanban: {
    probe: 'kanban\n  a',
    e2e: ['kanban'],
    harvest: {
      dir: `${V12_DIAGRAMS}/kanban`,
      docs: 'kanban.md',
      method: { kind: 'run', parsers: ['kanban'], specs: ['kanban.spec.ts'] },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
