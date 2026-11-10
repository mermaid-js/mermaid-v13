/** eventmodeling's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213, D220). */
export const langium = {
  eventmodeling: {
    probe: 'eventmodeling\ntf 01 evt A',
    factory: 'createEventModelingServices',
    key: 'EventModel',
  },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  eventmodeling: {
    header: 'eventmodeling',
    files: [
      'packages/mermaid/src/diagrams/eventmodeling/eventmodeling.spec.ts',
      'packages/mermaid/src/diagrams/eventmodeling/parser.ts',
      'packages/parser/tests/eventmodeling.test.ts',
      'packages/examples/src/examples/eventmodeling.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/eventmodeling.md',
  },
} satisfies Record<string, Harvest>;
