/** packet's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  packet: { probe: 'packet\n0: "a"', factory: 'createPacketServices', key: 'Packet' },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  packet: {
    header: 'packet(?:-beta)?',
    files: [
      'packages/mermaid/src/diagrams/packet/packet.spec.ts',
      'packages/mermaid/src/diagrams/packet/renderer.spec.ts',
      'packages/parser/tests/packet.test.ts',
      'packages/examples/src/examples/packet.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/packet.md',
  },
} satisfies Record<string, Harvest>;
