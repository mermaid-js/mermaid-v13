/** mindmap's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  mindmap: {
    probe: 'mindmap\n  root',
    e2e: ['mindmap'],
    harvest: {
      dir: `${V12_DIAGRAMS}/mindmap`,
      docs: 'mindmap.md',
      method: {
        kind: 'run',
        parsers: ['mindmap', 'parser'],
        specs: ['mindmap.spec.ts', 'mindmapColors.spec.ts'],
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
