/** timeline's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  timeline: {
    probe: 'timeline\n  title x',
    e2e: ['timeline'],
    harvest: {
      dir: `${V12_DIAGRAMS}/timeline`,
      docs: 'timeline.md',
      method: { kind: 'run', parsers: ['timeline'], specs: ['timeline.spec.js'] },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
