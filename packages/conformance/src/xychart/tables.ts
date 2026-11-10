/** xychart's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  xychart: {
    probe: 'xychart\n  bar [1]',
    e2e: ['xychart'],
    harvest: {
      dir: `${V12_DIAGRAMS}/xychart`,
      docs: 'xyChart.md',
      method: {
        kind: 'run',
        parsers: ['parser'],
        // The DB spec calls the DB's setters only, so it adds no source.
        specs: ['parser/xychart.jison.spec.ts', 'xychartDb.spec.ts'],
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
