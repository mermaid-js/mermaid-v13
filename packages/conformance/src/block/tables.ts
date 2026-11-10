/** block's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212, #553). */
export const jison = {
  block: {
    probe: 'block-beta\n  a',
    e2e: ['block'],
    harvest: {
      dir: `${V12_DIAGRAMS}/block`,
      docs: 'block.md',
      // Two specs build sources in templates with `${prop}`; the DB spec parses nothing.
      method: {
        kind: 'run',
        parsers: ['block'],
        specs: ['parser/block.spec.ts', 'blockDB.spec.ts', 'blockColorIndex.spec.ts'],
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
