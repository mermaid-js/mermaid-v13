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

/**
 * Why `name` cannot be a section label, if it cannot. A label is written between `"` (v12 also
 * read `'…'`); the service puts the new name between the quotes as it is, so it must read back
 * unchanged: no `"`, no `\` (an escape), no line break.
 */
function invalidReason(name: string): string | undefined {
  if (name === '') return 'A section label cannot be empty.';
  if (/[\r\n]/.test(name)) return 'A section label cannot contain a line break.';
  if (name.includes('"')) return 'A section label cannot contain `"`.';
  if (name.includes('\\')) return 'A section label cannot contain `\\` (it starts an escape).';
  return undefined;
}

/** The pie facet. */
export const pieLanguage: LanguageFacet<PieDocument> = {
  id: 'pie',
  parse: (text, options) => parsePie(text, options),
  categories: pieCategories,
  namespaces: [['slice']],
  isValidId: invalidReason,
  completions: pieCompletions,
  hover: pieHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { pieLanguage as language };
