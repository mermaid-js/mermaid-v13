/**
 * Quadrant language facet (`@mermaid-js/diagram-quadrant/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the renderer, the layout or the plugin; the import-boundary lint and the bench's
 * language bundle spec hold that in place.
 *
 * Symbols are classes only (a definition at `classDef`, a reference at `:::`); points are
 * statements, not symbols, since their names repeat.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { quadrantCompletions } from './facet/completions.ts';
import { quadrantHover } from './facet/hover.ts';
import { classReason } from './facet/names.ts';
import { quadrantCategories } from './generated/categories.ts';
import { parseQuadrant } from './parser/parser.ts';
import type { QuadrantDocument } from './parser/ast.ts';

export { quadrantCategories } from './generated/categories.ts';
export { quadrantDocs } from './generated/docs.ts';
export { detectQuadrant, parseQuadrant, quadrantTokens } from './parser/index.ts';
export { T as QuadrantTokenKind } from './parser/tokens.ts';
export type * from './parser/ast.ts';
export type { QuadrantParseOptions, QuadrantParseResult } from './parser/parser.ts';

/** The quadrant facet. */
export const quadrantLanguage: LanguageFacet<QuadrantDocument> = {
  id: 'quadrantChart',
  parse: (text, options) => parseQuadrant(text, options),
  categories: quadrantCategories,
  namespaces: [['class']],
  isValidId: (name) => classReason(name),
  completions: quadrantCompletions,
  hover: quadrantHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { quadrantLanguage as language };
