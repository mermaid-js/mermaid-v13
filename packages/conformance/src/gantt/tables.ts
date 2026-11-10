/** gantt's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  gantt: {
    probe: 'gantt\n  title x',
    e2e: ['gantt'],
    harvest: {
      dir: `${V12_DIAGRAMS}/gantt`,
      docs: 'gantt.md',
      method: { kind: 'run', parsers: ['parser'], specs: ['parser/gantt.spec.js'] },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
