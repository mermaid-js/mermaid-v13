/**
 * Radar language facet (`@mermaid-js/diagram-radar/language`, DESIGN §4.5, R-LANG-8, D89): the
 * parser entry and the tables the language service needs. Nothing reachable from here imports
 * the layout or a renderer; the import-boundary lint and the bench's language bundle spec hold
 * that in place.
 *
 * Symbols (D358): each axis name is an `axis` symbol, defined by its first `axis` statement; a
 * repeated `axis A` and every detailed entry name (`A: 1`) refer to it, and an entry naming no
 * axis is an unresolved reference. Curve names are `curve` symbols, definitions only, in their
 * own namespace. Rename refuses a name the lexer would not read as one name (D357) and, through
 * the service's clash check, a name another axis already has.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { radarCompletions } from './facet/completions.ts';
import { radarHover } from './facet/hover.ts';
import { nameReason } from './facet/names.ts';
import { radarCategories } from './generated/categories.ts';
import { parseRadar } from './parser/index.ts';
import type { RadarDocument } from './parser/index.ts';

export { radarCategories } from './generated/categories.ts';
export { radarDocs } from './generated/docs.ts';
export { detectRadar, parseRadar, RadarTokenKind, radarTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The radar facet. */
export const radarLanguage: LanguageFacet<RadarDocument> = {
  id: 'radar',
  parse: (text, options) => parseRadar(text, options),
  categories: radarCategories,
  namespaces: [['axis'], ['curve']],
  isValidId: nameReason,
  completions: radarCompletions,
  hover: radarHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { radarLanguage as language };
