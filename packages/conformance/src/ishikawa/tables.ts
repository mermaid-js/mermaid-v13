/** ishikawa's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { startsWith, V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  ishikawa: {
    probe: 'ishikawa-beta\n  P',
    e2e: ['ishikawa'],
    harvest: {
      dir: `${V12_DIAGRAMS}/ishikawa`,
      docs: 'ishikawa.md',
      method: { kind: 'literals', header: startsWith('ishikawa') },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
