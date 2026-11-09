/** class's rows in the shared oracle tables (`src/tables.ts`). */
import type { JisonTypeDescriptor } from '../jison/types.ts';
import { V12_DIAGRAMS } from '../jison/types.ts';

/** Its row of the jison lexer oracle and harvest (D212). */
export const jison = {
  class: {
    probe: 'classDiagram\n  class A',
    e2e: ['class-diagram'],
    smoke: false,
    harvest: {
      dir: `${V12_DIAGRAMS}/class`,
      docs: 'classDiagram.md',
      // A class source, or one that opens with front matter or a directive before the header.
      method: { kind: 'chains', header: /^\s*(?:classDiagram|(?:---|%%)[\s\S]*classDiagram)/ },
    },
  },
} satisfies Record<string, JisonTypeDescriptor>;
