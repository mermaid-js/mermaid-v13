/**
 * Venn language facet (`@mermaid-js/diagram-venn/language`, DESIGN §4.5, R-LANG-8, D89): the
 * parser entry and the tables the language service needs. Nothing reachable from here imports
 * the layout, the solver or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D418): each set id is a `set` symbol, defined by its first `set` statement (a set
 * only `union`, `text` or `style` name has no definition, `declaredOnly`), and the ids in
 * `union`, `text` and `style` refer to it; each text node id is a `text` symbol in a namespace
 * of its own, which a one-id `style` naming no set refers to. A rename changes every occurrence,
 * keeps quotes, quotes a new name that is not a bare id (`quoteId`), and the service refuses a
 * name the namespace already has. A `set` or `union` folds with the indented `text` lines under
 * it, from the parser's statement spans.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { vennCompletions } from './facet/completions.ts';
import { vennHover } from './facet/hover.ts';
import { invalidReason, quotedId } from './facet/names.ts';
import { vennCategories } from './generated/categories.ts';
import { parseVenn } from './parser/index.ts';
import type { VennDocument } from './parser/index.ts';

export { vennCategories } from './generated/categories.ts';
export { vennDocs } from './generated/docs.ts';
export { detectVenn, parseVenn, VennTokenKind, vennTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The venn facet. */
export const vennLanguage: LanguageFacet<VennDocument> = {
  id: 'venn',
  parse: (text, options) => parseVenn(text, options),
  categories: vennCategories,
  namespaces: [['set'], ['text']],
  declaredOnly: true,
  isValidId: invalidReason,
  quoteId: (name) => quotedId(name),
  completions: vennCompletions,
  hover: vennHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { vennLanguage as language };
