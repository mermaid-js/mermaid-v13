/** wardley's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  wardley: {
    probe: 'wardley-beta\ncomponent A [0.5, 0.5]',
    factory: 'createWardleyServices',
    key: 'Wardley',
  },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  wardley: {
    header: 'wardley-beta',
    files: [
      'packages/mermaid/src/diagrams/wardley/wardleyParser.spec.ts',
      'packages/mermaid/src/diagrams/wardley/wardleyBuilder.spec.ts',
      'packages/examples/src/examples/wardley.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/wardley.md',
  },
} satisfies Record<string, Harvest>;
