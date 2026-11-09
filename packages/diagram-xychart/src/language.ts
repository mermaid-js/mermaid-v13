/**
 * XY chart language facet (`@mermaid-js/diagram-xychart/language`, DESIGN §4.5, R-LANG-8,
 * D89): the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D389): each band category is a `category` symbol whose range is the bare text or the
 * quoted string (D191), and each named plot a `plot` symbol in its own namespace. Both are
 * `standalone`: each occurrence is its own definition, since repeats are separate categories
 * and plots in v12's model (two `Sales` plots are two plots, two colours, two legend rows), so
 * a rename changes one and may give it a name another already has. Range axes and values have
 * none. A rename keeps the quotes and adds them when a bare name gains a blank or punctuation
 * (`writtenName`).
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { xyChartCompletions } from './facet/completions.ts';
import { xyChartHover } from './facet/hover.ts';
import { nameReason, writtenName } from './facet/names.ts';
import { xychartCategories } from './generated/categories.ts';
import { parseXyChart } from './parser/parser.ts';
import type { XyChartDocument } from './parser/ast.ts';

export { xychartCategories } from './generated/categories.ts';
export { xychartDocs } from './generated/docs.ts';
export { detectXyChart, parseXyChart, xyChartTokens, XyChartTokenKind } from './parser/index.ts';
export type * from './parser/ast.ts';
export type { XyChartParseOptions, XyChartParseResult } from './parser/parser.ts';

/** The XY chart facet. */
export const xyChartLanguage: LanguageFacet<XyChartDocument> = {
  id: 'xychart',
  parse: (text, options) => parseXyChart(text, options),
  categories: xychartCategories,
  namespaces: [['category'], ['plot']],
  standalone: ['category', 'plot'],
  isValidId: nameReason,
  writtenName,
  completions: xyChartCompletions,
  hover: xyChartHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { xyChartLanguage as language };
