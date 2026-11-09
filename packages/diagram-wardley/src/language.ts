/**
 * Wardley language facet (`@mermaid-js/diagram-wardley/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or the renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D427): each anchor or component name (a pipeline's components included) is a `node`
 * symbol, its range the name or its quoted string (D191). The first `anchor` or `component` of a
 * name defines it, and a repeat (which v12 merges) refers to it; the names in links, `evolve`,
 * `pipeline` and the (de)accelerators are references, and one that no anchor or component has
 * has no symbol. Rename changes them all, keeps quotes, adds them where the new name cannot be
 * written unquoted (D423, `quoteId`) and, through the service's clash check, refuses an existing
 * name.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { wardleyCompletions } from './facet/completions.ts';
import { wardleyHover } from './facet/hover.ts';
import { nameReason, quoteName } from './facet/names.ts';
import { wardleyCategories } from './generated/categories.ts';
import { parseWardley } from './parser/index.ts';
import type { WardleyDocument } from './parser/index.ts';

export { wardleyCategories } from './generated/categories.ts';
export { wardleyDocs } from './generated/docs.ts';
export { detectWardley, parseWardley, WardleyTokenKind, wardleyTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The wardley facet. */
export const wardleyLanguage: LanguageFacet<WardleyDocument> = {
  id: 'wardley',
  parse: (text, options) => parseWardley(text, options),
  categories: wardleyCategories,
  namespaces: [['node']],
  isValidId: (name) => nameReason(name),
  quoteId: (name) => quoteName(name),
  completions: wardleyCompletions,
  hover: wardleyHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { wardleyLanguage as language };
