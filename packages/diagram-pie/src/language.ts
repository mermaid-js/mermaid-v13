/**
 * Pie language facet (`@mermaid-js/diagram-pie/language`, DESIGN §4.5, R-LANG-8, D89): the
 * parser entry and the tables the language service needs. Nothing reachable from here imports
 * the layout or a renderer; the import-boundary lint and the bench's language bundle spec hold
 * that in place.
 *
 * Symbols (D229): each section label is a `slice` symbol over its quoted string (D191), a
 * repeated label a reference to the first. The service renames the text between the quotes,
 * keeps them, and refuses a name another section already has.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { pieCompletions } from './facet/completions.ts';
import { pieHover } from './facet/hover.ts';
import { pieCategories } from './generated/categories.ts';
import { parsePie } from './parser/index.ts';
import type { PieDocument } from './parser/index.ts';

export { pieCategories } from './generated/categories.ts';
export { pieDocs } from './generated/docs.ts';
export { detectPie, parsePie, PieTokenKind, pieTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The pie facet. */
export const pieLanguage: LanguageFacet<PieDocument> = {
  id: 'pie',
  parse: (text, options) => parsePie(text, options),
  categories: pieCategories,
  namespaces: [['slice']],
  // Required by the facet interface, but the service asks only for a name written bare, and a
  // pie label is always quoted: the quoted-name check and the read-back decide (D229).
  isValidId: () => undefined,
  completions: pieCompletions,
  hover: pieHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { pieLanguage as language };
