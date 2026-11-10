/**
 * C4 language facet (`@mermaid-js/diagram-c4/language`, DESIGN §4.5, R-LANG-8, D89): the parser
 * entry and the tables the language service needs. Nothing reachable from here imports the
 * layout or the renderer; the import-boundary lint and the bench's language bundle spec hold
 * that in place.
 *
 * Symbols (D458): each alias is an `element` or a `boundary` symbol, in separate namespaces
 * (an element and a boundary may share an alias, as in v12). The first macro with an alias
 * defines it; a later one with the same alias (a merge), a relation end and an `Update…Style`
 * target refer to it, an element first where both have it; an alias no macro defines has no
 * definition (`declaredOnly`). A rename refuses an alias with a
 * blank, `,` or `)`, and (the service's check) one its namespace has already; one the other
 * namespace has is refused when the statements that name either would then name the other.
 * Boundaries and a multi-line `accDescr { … }` fold.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { c4Completions } from './facet/completions.ts';
import { c4Hover } from './facet/hover.ts';
import { invalidReason } from './facet/names.ts';
import { c4Categories } from './generated/categories.ts';
import { parseC4 } from './parser/index.ts';
import type { C4Document } from './parser/index.ts';

export { c4Categories } from './generated/categories.ts';
export { c4Docs } from './generated/docs.ts';
export { C4TokenKind, c4Tokens, detectC4, parseC4 } from './parser/index.ts';
export type * from './parser/index.ts';

/** The C4 facet. */
export const c4Language: LanguageFacet<C4Document> = {
  id: 'c4',
  parse: (text, options) => parseC4(text, options),
  categories: c4Categories,
  namespaces: [['element'], ['boundary']],
  // An alias no macro defines (an unknown relation end, D457) has no definition.
  declaredOnly: true,
  isValidId: invalidReason,
  completions: c4Completions,
  hover: c4Hover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { c4Language as language };
