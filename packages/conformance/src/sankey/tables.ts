/** sankey's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  sankey: {
    probe: 'sankey\na,b,1',
    e2e: ['sankey'],
    harvest: {
      dir: `${V12_DIAGRAMS}/sankey`,
      docs: 'sankey.md',
      // Every parse goes through `prepareTextForParsing` (two of them through `cleanupComments`
      // too), and two read `energy.csv`.
      method: {
        kind: 'run',
        parsers: ['sankey'],
        specs: ['parser/sankey.spec.ts'],
        identity: ['prepareTextForParsing', 'cleanupComments'],
        readsFiles: true,
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
