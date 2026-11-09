/** cynefin's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  cynefin: { probe: 'cynefin-beta\ncomplex', factory: 'createCynefinServices', key: 'Cynefin' },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  cynefin: {
    header: 'cynefin-beta',
    files: [
      'packages/mermaid/src/diagrams/cynefin/cynefin.integration.spec.ts',
      'packages/examples/src/examples/cynefin.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/cynefin.md',
  },
} satisfies Record<string, Harvest>;
