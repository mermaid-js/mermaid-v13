/**
 * Sankey language facet (`@mermaid-js/diagram-sankey/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D398): each node name is a `node` symbol whose range is its trimmed field or its
 * quoted string (D191); the first occurrence is the definition, every later one a reference.
 * The name syntax ({@link sankeyNames}) reads a quoted name with `""` in it and writes a new
 * name in quotes when it holds a `,`, `"` or line break, doubling `"`. `isValidId` refuses a
 * name v12 could not read back; the service refuses an existing node name (it would merge two
 * nodes).
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { sankeyCompletions } from './facet/completions.ts';
import { sankeyHover } from './facet/hover.ts';
import { invalidReason, sankeyNames } from './facet/names.ts';
import { sankeyCategories } from './generated/categories.ts';
import { parseSankey } from './parser/index.ts';
import type { SankeyDocument } from './parser/index.ts';

export { sankeyCategories } from './generated/categories.ts';
export { sankeyDocs } from './generated/docs.ts';
export { detectSankey, parseSankey, SankeyTokenKind, sankeyTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The sankey facet. */
export const sankeyLanguage: LanguageFacet<SankeyDocument> = {
  id: 'sankey',
  parse: (text, options) => parseSankey(text, options),
  categories: sankeyCategories,
  namespaces: [['node']],
  isValidId: invalidReason,
  nameSyntax: sankeyNames,
  completions: sankeyCompletions,
  hover: sankeyHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { sankeyLanguage as language };
