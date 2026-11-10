/** treeView's rows in the shared oracle tables (`src/tables.ts`). */
import type { Harvest } from '../cli/harvest-v12.ts';
import type { LangiumLexerDescriptor } from '../langium-lexer.ts';

/**
 * Its row of the Langium lexer oracle (D213). `capture: 'langium'`: v12's diagram parser runs
 * its box-drawing rewrite before Langium lexes, so the oracle reads what the shared Langium
 * parser received (#571).
 */
export const langium = {
  treeView: {
    probe: 'treeView-beta\n  a',
    factory: 'createTreeViewServices',
    key: 'TreeView',
    capture: 'langium',
  },
} satisfies Record<string, LangiumLexerDescriptor>;

/** Its row of the v12 spec harvest (`harvest-v12.ts`). */
export const harvest = {
  treeView: {
    header: 'treeView-beta',
    files: [
      'packages/mermaid/src/diagrams/treeView/parser.spec.ts',
      'packages/mermaid/src/diagrams/treeView/boxDrawingPreprocessor.spec.ts',
      'packages/parser/tests/treeView.test.ts',
      'packages/examples/src/examples/tree-view.ts',
      'packages/mermaid/src/rendering-util/multi-diagram-id-uniqueness.spec.ts',
    ],
    docs: 'packages/mermaid/src/docs/syntax/treeView.md',
  },
} satisfies Record<string, Harvest>;
