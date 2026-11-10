/** journey's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  journey: {
    probe: 'journey\n  title x',
    e2e: ['journey'],
    harvest: {
      dir: `${V12_DIAGRAMS}/user-journey`,
      docs: 'userJourney.md',
      method: { kind: 'run', parsers: ['parser'], specs: ['parser/journey.spec.js'] },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
