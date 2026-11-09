/** architecture's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its row of the Langium lexer oracle (D213). */
export const langium = {
  architecture: {
    probe: 'architecture-beta\nservice a',
    factory: 'createArchitectureServices',
    key: 'Architecture',
  },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  architecture: {
    header: 'architecture(?:-beta)?',
    files: [
      'packages/mermaid/src/diagrams/architecture/architecture.spec.ts',
      'packages/mermaid/src/diagrams/architecture/architectureSeed.spec.ts',
      'packages/mermaid/src/diagrams/architecture/svgDraw.spec.ts',
      'packages/parser/tests/architecture.test.ts',
      'packages/examples/src/examples/architecture.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/architecture.md',
  },
} satisfies Record<string, Harvest>;
