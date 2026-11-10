/** c4's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  c4: {
    probe: 'C4Context\nPerson(a, "A")',
    e2e: ['c4'],
    harvest: {
      dir: `${V12_DIAGRAMS}/c4`,
      docs: 'c4.md',
      method: {
        kind: 'run',
        parsers: ['c4'],
        specs: [
          'parser/c4Boundary.spec.ts',
          'parser/c4Component.spec.ts',
          'parser/c4Container.spec.ts',
          'parser/c4Diagram.spec.ts',
          'parser/c4NamedAttributes.spec.ts',
          'parser/c4Person.spec.ts',
          'parser/c4PersonExt.spec.ts',
          'parser/c4System.spec.ts',
        ],
      },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
