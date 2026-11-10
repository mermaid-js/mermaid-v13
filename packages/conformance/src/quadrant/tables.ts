/** quadrant's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  quadrant: {
    probe: 'quadrantChart\n  title x',
    e2e: ['quadrant-chart'],
    harvest: {
      dir: `${V12_DIAGRAMS}/quadrant-chart`,
      docs: 'quadrantChart.md',
      method: { kind: 'run', parsers: ['parser'], specs: ['parser/quadrant.jison.spec.ts'] },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
