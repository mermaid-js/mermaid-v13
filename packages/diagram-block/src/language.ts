/**
 * Block language facet (`@mermaid-js/diagram-block/language`, DESIGN §4.5, R-LANG-8, D89): the
 * parser entry and the tables the language service needs. Nothing reachable from here imports
 * the layout or the renderer; the import-boundary lint and the bench's language bundle spec
 * hold that in place.
 *
 * Symbols (D448): each block id is a `block` symbol, its first occurrence (a leaf, a composite
 * header or an edge end) its definition and every later one, `class` and `style` targets
 * included, a reference; each `classDef` name is a `class` symbol, and the words of a `class`
 * statement's class text refer to it. A rename refuses an existing id (the service's check) and
 * a character the id rule does not take (`isValidId`). Each `block … end` folds.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { blockCompletions } from './facet/completions.ts';
import { blockHover } from './facet/hover.ts';
import { invalidReason } from './facet/names.ts';
import { blockCategories } from './generated/categories.ts';
import { parseBlock } from './parser/index.ts';
import type { BlockDocument } from './parser/index.ts';

export { blockCategories } from './generated/categories.ts';
export { blockDocs } from './generated/docs.ts';
export { BlockTokenKind, blockTokens, detectBlock, parseBlock } from './parser/index.ts';
export type * from './parser/index.ts';

/** The block facet. */
export const blockLanguage: LanguageFacet<BlockDocument> = {
  id: 'block',
  parse: (text, options) => parseBlock(text, options),
  categories: blockCategories,
  namespaces: [['block'], ['class']],
  isValidId: invalidReason,
  completions: blockCompletions,
  hover: blockHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { blockLanguage as language };
