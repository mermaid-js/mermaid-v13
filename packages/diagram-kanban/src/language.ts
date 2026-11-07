/**
 * Kanban language facet (`@mermaid-js/diagram-kanban/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (as D289): each item id is a definition with no references, so it is `standalone`
 * (ids repeat: two columns `docs` are two symbols), and a rename changes that id only. The words
 * of `:::` lines are `class` names, one namespace, and rename together. Each `assigned` value is
 * an `assignee`, so a rename spans cards (as journey's actors). Each column folds to the line
 * before the next column.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { kanbanCompletions } from './facet/completions.ts';
import { kanbanHover } from './facet/hover.ts';
import { invalidReason } from './facet/names.ts';
import { kanbanCategories } from './generated/categories.ts';
import { parseKanban } from './parser/index.ts';
import type { KanbanDocument } from './parser/index.ts';

export { kanbanCategories } from './generated/categories.ts';
export { kanbanDocs } from './generated/docs.ts';
export { detectKanban, KanbanTokenKind, kanbanTokens, parseKanban } from './parser/index.ts';
export type * from './parser/index.ts';

/** The kanban facet. */
export const kanbanLanguage: LanguageFacet<KanbanDocument> = {
  id: 'kanban',
  parse: (text, options) => parseKanban(text, options),
  categories: kanbanCategories,
  namespaces: [['node'], ['class'], ['assignee']],
  standalone: ['node'],
  isValidId: invalidReason,
  completions: kanbanCompletions,
  hover: kanbanHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { kanbanLanguage as language };
