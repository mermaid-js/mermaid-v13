/**
 * Requirement language facet (`@mermaid-js/diagram-requirement/language`, DESIGN §4.5, R-LANG-8,
 * D89, D437): the parser entry and the tables the language service needs. Nothing reachable from
 * here imports the layout, renderer or plugin; the import-boundary lint and the bench's language
 * bundle spec hold that in place.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { requirementCompletions } from './facet/completions.ts';
import { requirementHover } from './facet/hover.ts';
import { nameReason, quoteName } from './facet/names.ts';
import { requirementCategories } from './generated/categories.ts';
import { parseRequirement } from './parser/parser.ts';
import type { RequirementDocument } from './parser/ast.ts';

export { requirementCategories } from './generated/categories.ts';
export { requirementDocs } from './generated/docs.ts';
export { detectRequirement } from './parser/detect.ts';
export { parseRequirement } from './parser/parser.ts';
export { T as RequirementTokenKind } from './parser/tokens.ts';
export type * from './parser/ast.ts';
export type { RequirementParseOptions, RequirementParseResult } from './parser/parser.ts';

/** The requirement facet. */
export const requirementLanguage: LanguageFacet<RequirementDocument> = {
  id: 'requirement',
  parse: (text, options) => parseRequirement(text, options),
  categories: requirementCategories,
  namespaces: [['requirement', 'element'], ['class']],
  isValidId: nameReason,
  quoteId: quoteName,
  completions: requirementCompletions,
  hover: requirementHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { requirementLanguage as language };
