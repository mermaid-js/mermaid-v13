/**
 * Event modeling language facet (`@mermaid-js/diagram-eventmodeling/language`, DESIGN §4.5,
 * R-LANG-8, D89, spec #527 "Language facet (T6)"): the parser entry and the tables the language
 * service needs. Nothing reachable from here imports the layout or the renderer; the
 * import-boundary lint and the bench's language bundle spec hold that in place (`structure.ts`,
 * which hover reuses for lanes and sources, is pure model code).
 *
 * Symbols (D528): frame ids, data names and entity names, each its own name space. The first
 * declaration defines one (a repeat refers to it); `->>`, `note` and `gwt` refer to frame ids,
 * `[[ ]]` to data names and `gwt` steps to entity names; a reference to a name nothing declares
 * has no symbol. Rename changes them all, keeps a frame id at one to three digits, and refuses
 * keywords, non-ASCII names and (the service's clash check) an id already in use.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { eventModelingCompletions } from './facet/completions.ts';
import { eventModelingHover } from './facet/hover.ts';
import { idReason } from './facet/names.ts';
import { eventmodelingCategories } from './generated/categories.ts';
import { parseEventModel } from './parser/index.ts';
import type { EventModelDocument } from './parser/index.ts';

export { eventmodelingCategories } from './generated/categories.ts';
export { eventmodelingDocs } from './generated/docs.ts';
export {
  detectEventModeling,
  EventModelingTokenKind,
  eventModelingTokens,
  parseEventModel,
} from './parser/index.ts';
export type * from './parser/index.ts';

/** The event modeling facet. */
export const eventModelingLanguage: LanguageFacet<EventModelDocument> = {
  id: 'eventmodeling',
  parse: (text, options) => parseEventModel(text, options),
  categories: eventmodelingCategories,
  namespaces: [['frame'], ['data'], ['entity']],
  isValidId: idReason,
  completions: eventModelingCompletions,
  hover: eventModelingHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { eventModelingLanguage as language };
