/**
 * Info language facet (`@mermaid-js/diagram-info/language`, DESIGN §4.5, R-LANG-8, D89): the
 * parser entry and the tables the language service needs. Nothing reachable from here imports
 * the layout or the renderer; the import-boundary lint and the bench's language bundle spec
 * hold that in place.
 *
 * No symbols: nothing in an info diagram has a name, so definition and references are empty
 * and rename is refused. Completion offers `showInfo` and the statements; hover shows each
 * keyword's doc from the grammar file.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { infoCompletions } from './facet/completions.ts';
import { infoHover } from './facet/hover.ts';
import { infoCategories } from './generated/categories.ts';
import { parseInfo } from './parser/index.ts';
import type { InfoDocument } from './parser/index.ts';

export { infoCategories } from './generated/categories.ts';
export { infoDocs } from './generated/docs.ts';
export { detectInfo, InfoTokenKind, infoTokens, parseInfo } from './parser/index.ts';
export type * from './parser/index.ts';

const NO_IDS = 'An info diagram has nothing to rename: it has no ids.';

/** The info facet. */
export const infoLanguage: LanguageFacet<InfoDocument> = {
  id: 'info',
  parse: (text, options) => parseInfo(text, options),
  categories: infoCategories,
  namespaces: [],
  isValidId: () => NO_IDS,
  completions: infoCompletions,
  hover: infoHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { infoLanguage as language };
