/** treemap's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  treemap: { probe: 'treemap\n"a": 1', factory: 'createTreemapServices', key: 'Treemap' },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  treemap: {
    header: 'treemap(?:-beta)?',
    files: [
      'packages/mermaid/src/diagrams/treemap/utils.test.ts',
      'packages/parser/tests/treemap.test.ts',
      'packages/examples/src/examples/treemap.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/treemap.md',
  },
} satisfies Record<string, Harvest>;
