/** radar's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  radar: { probe: 'radar-beta\naxis A', factory: 'createRadarServices', key: 'Radar' },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  radar: {
    header: 'radar-beta',
    files: [
      'packages/mermaid/src/diagrams/radar/radar.spec.ts',
      'packages/parser/tests/radar.test.ts',
      'packages/examples/src/examples/radar.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/radar.md',
  },
} satisfies Record<string, Harvest>;
