/**
 * Timeline language facet (`@mermaid-js/diagram-timeline/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout or a renderer; the import-boundary lint and the bench's language
 * bundle spec hold that in place.
 *
 * No symbols (D259): nothing in a timeline refers to a section, period or event, so
 * definition and references are empty and rename is refused. Each `section` folds to the line
 * before the next one: the parser gives each section a statement span holding the statements
 * after it.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { timelineCompletions } from './facet/completions.ts';
import { timelineHover } from './facet/hover.ts';
import { timelineCategories } from './generated/categories.ts';
import { parseTimeline } from './parser/index.ts';
import type { TimelineDocument } from './parser/index.ts';

export { timelineCategories } from './generated/categories.ts';
export { timelineDocs } from './generated/docs.ts';
export {
  detectTimeline,
  parseTimeline,
  TimelineTokenKind,
  timelineTokens,
} from './parser/index.ts';
export type * from './parser/index.ts';

const NO_IDS = 'A timeline has nothing to rename: sections, periods and events have no ids.';

/** The timeline facet. */
export const timelineLanguage: LanguageFacet<TimelineDocument> = {
  id: 'timeline',
  parse: (text, options) => parseTimeline(text, options),
  categories: timelineCategories,
  namespaces: [],
  isValidId: () => NO_IDS,
  completions: timelineCompletions,
  hover: timelineHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { timelineLanguage as language };
