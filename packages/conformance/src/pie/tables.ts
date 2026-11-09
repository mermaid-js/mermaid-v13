/** pie's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  pie: { probe: 'pie\n"a": 1', factory: 'createPieServices', key: 'Pie' },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  pie: {
    header: 'pie',
    files: [
      'packages/mermaid/src/diagrams/pie/pie.spec.ts',
      'packages/mermaid/src/diagrams/pie/pieRenderer.spec.ts',
      'packages/parser/tests/pie.test.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/pie.md',
  },
} satisfies Record<string, Harvest>;
