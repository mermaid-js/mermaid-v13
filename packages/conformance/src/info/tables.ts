/** info's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  info: { probe: 'info', factory: 'createInfoServices', key: 'Info' },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  info: {
    header: 'info',
    files: [
      'packages/mermaid/src/diagrams/info/info.spec.ts',
      'packages/parser/tests/info.test.ts',
    ],
  },
} satisfies Record<string, Harvest>;
