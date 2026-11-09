/** requirement's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  requirement: {
    probe: 'requirementDiagram\n',
    e2e: ['requirement'],
    // `with-a-title` closes its front matter with an indented `  ---`, so v12 rejects it before
    // its lexer runs (spec #520); it stays a rejection fixture.
    notLexed: ['requirement/visual-check/with-a-title-default.mmd'],
    harvest: {
      dir: `${V12_DIAGRAMS}/requirement`,
      docs: 'requirementDiagram.md',
      // The spec builds its sources with `[…].join('\n')`, from the DB's risk, verify-method
      // and relationship tables; the DB spec calls the DB only.
      method: {
        kind: 'run',
        parsers: ['reqDiagram'],
        specs: ['parser/requirementDiagram.spec.js'],
        constants: { name: 'RequirementDB', file: 'requirementDb.ts' },
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
