/**
 * TreeView language facet (`@mermaid-js/diagram-treeview/language`, DESIGN §4.5, R-LANG-8, D89,
 * #576): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout or a renderer; the import-boundary lint and the bench's language
 * bundle spec hold that in place.
 *
 * Symbols (D487): each node is a `node` symbol over its name (inside its quotes, without a
 * directory's `/`), its own definition with no references, though names repeat
 * (`standalone`); a rename changes that name only, keeps its quotes and a directory's `/`, and
 * refuses a name with a line break or one ending with `/`, which would turn a file into a
 * directory. The facet reads and writes the names itself (`nameSyntax`, `facet/names.ts`).
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { treeViewCompletions } from './facet/completions.ts';
import { treeViewHover } from './facet/hover.ts';
import { nameReason, treeViewNameSyntax } from './facet/names.ts';
import { treeviewCategories } from './generated/categories.ts';
import { parseTreeView } from './parser/index.ts';
import type { TreeViewDocument } from './parser/index.ts';

export { treeviewCategories } from './generated/categories.ts';
export { treeviewDocs } from './generated/docs.ts';
export {
  detectTreeView,
  parseTreeView,
  TreeViewTokenKind,
  treeViewTokens,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { TreeViewParseOptions, TreeViewParseResult } from './parser/index.ts';
export type { TreeViewModel, TreeViewNode } from './model.ts';

/** The treeView facet. */
export const treeViewLanguage: LanguageFacet<TreeViewDocument> = {
  id: 'treeView',
  parse: (text, options) => parseTreeView(text, options),
  categories: treeviewCategories,
  namespaces: [['node']],
  standalone: ['node'],
  isValidId: (name) => nameReason(name),
  nameSyntax: treeViewNameSyntax,
  completions: treeViewCompletions,
  hover: treeViewHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { treeViewLanguage as language };
