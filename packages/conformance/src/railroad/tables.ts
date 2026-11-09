/** railroad's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/** Its rows of the Langium lexer oracle (D213): one per v12 notation, each its own parser (D511). */
export const langium = {
  railroad: {
    probe: 'railroad-beta\na = terminal("x") ;',
    factory: 'createRailroadServices',
    key: 'Railroad',
  },
  railroadEbnf: {
    probe: 'railroad-ebnf-beta\na = "x" ;',
    factory: 'createRailroadEbnfServices',
    key: 'RailroadEbnf',
  },
  railroadAbnf: {
    probe: 'railroad-abnf-beta\na = "x" ;',
    factory: 'createRailroadAbnfServices',
    key: 'RailroadAbnf',
  },
  railroadPeg: {
    probe: 'railroad-peg-beta\na <- "x" ;',
    factory: 'createRailroadPegServices',
    key: 'RailroadPeg',
  },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest: all four notations in one corpus, routed by header. */
export const harvest = {
  railroad: {
    header: 'railroad(?:-ebnf|-abnf|-peg)?-beta',
    files: [
      'packages/mermaid/src/diagrams/railroad/parser/railroadDiagram.spec.ts',
      'packages/mermaid/src/diagrams/railroad/parser/ebnfDiagram.spec.ts',
      'packages/mermaid/src/diagrams/railroad/parser/abnfDiagram.spec.ts',
      'packages/mermaid/src/diagrams/railroad/parser/pegDiagram.spec.ts',
      'packages/mermaid/src/diagrams/railroad/railroadRenderer.spec.ts',
      'packages/mermaid/src/diagrams/railroad/railroadDetector.spec.ts',
      'packages/mermaid/src/diagrams/railroad/ebnfDetector.spec.ts',
      'packages/mermaid/src/diagrams/railroad/abnfDetector.spec.ts',
      'packages/mermaid/src/diagrams/railroad/pegDetector.spec.ts',
      'packages/parser/tests/railroad.test.ts',
      'packages/examples/src/examples/railroad.ts',
      'packages/examples/src/examples/railroad-ebnf.ts',
      'packages/examples/src/examples/railroad-abnf.ts',
      'packages/examples/src/examples/railroad-peg.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/railroad.md',
  },
} satisfies Record<string, Harvest>;
