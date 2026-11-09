/**
 * Treemap language facet (`@mermaid-js/diagram-treemap/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D408): each section and leaf name is a `node` symbol over its quoted string (D191),
 * each its own definition with no references, though names repeat (`standalone`); a rename
 * keeps the quotes and changes that row alone. Each class is a `class` symbol: its first
 * `classDef` defines it, a repeated `classDef` and every `:::name` refer to it, and a `:::name`
 * no `classDef` defines has no definition (`declaredOnly`). Rename refuses a class name the
 * lexer would not read as one name, or of one character (D401).
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { treemapCompletions } from './facet/completions.ts';
import { treemapHover } from './facet/hover.ts';
import { nameReason } from './facet/names.ts';
import { treemapCategories } from './generated/categories.ts';
import { parseTreemap } from './parser/index.ts';
import type { TreemapDocument } from './parser/index.ts';

export { treemapCategories } from './generated/categories.ts';
export { treemapDocs } from './generated/docs.ts';
export { detectTreemap, parseTreemap, TreemapTokenKind, treemapTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The treemap facet. */
export const treemapLanguage: LanguageFacet<TreemapDocument> = {
  id: 'treemap',
  parse: (text, options) => parseTreemap(text, options),
  categories: treemapCategories,
  namespaces: [['node'], ['class']],
  standalone: ['node'],
  declaredOnly: true,
  isValidId: nameReason,
  completions: treemapCompletions,
  hover: treemapHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { treemapLanguage as language };
