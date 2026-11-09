/**
 * TreeView language facet (`@mermaid-js/diagram-treeview/language`, DESIGN §4.5, R-LANG-8, D89,
 * #576): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout or a renderer: the bench's language bundle spec holds that in place
 * (the import-boundary lint knows `render/`, which T4 adds, but not `layout/`).
 *
 * Symbols (D487): each node is a `node` symbol, its own definition with no references, though
 * names repeat (`standalone`). The parser records it over the name as written, its quotes and a
 * directory's `/` included; the facet's `nameSyntax` (`facet/names.ts`) reads the occurrence
 * the service uses, the bare name inside them, and writes renames: that name only, its quotes
 * and a directory's `/` kept. Rename refuses a name with a line break, and one ending with `/`,
 * which would turn a file into a directory (the service compares a rename's result with the new
 * name as given, so a directory cannot take `lib/` as `lib` either).
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
