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
import type { DocumentView, LanguageFacet } from '@mermaid-js/core/parser-kit';
import type { C4BetaDocument } from './beta/ast.ts';
import { detectC4Beta } from './beta/detect.ts';
import { isC4Beta } from './beta/model.ts';
import { parseC4Beta } from './beta/parser.ts';
import { c4betaCompletions } from './facet/beta-completions.ts';
import { c4betaHover } from './facet/beta-hover.ts';
import { c4Completions } from './facet/completions.ts';
import { c4Hover } from './facet/hover.ts';
import { invalidReason } from './facet/names.ts';
import { c4betaCategories } from './generated/c4beta.categories.ts';
import { c4Categories } from './generated/categories.ts';
import { parseC4 } from './parser/index.ts';
import type { C4Document } from './parser/index.ts';

export { c4Categories } from './generated/categories.ts';
export { c4Docs } from './generated/docs.ts';
export { C4TokenKind, c4Tokens, detectC4, parseC4 } from './parser/index.ts';
export type * from './parser/index.ts';

/**
 * The facet's one kind to category table: legacy C4's and c4-beta's. The two sets of kinds do
 * not overlap (`FIRST_BETA_KIND`) and the shared kinds agree, so the union is each table.
 */
const categories = Object.freeze({ ...c4Categories, ...c4betaCategories });

/**
 * Whether the document is c4-beta: told by the parse the view holds (its header decided it), so
 * the text is not preprocessed again on every request.
 */
const isBeta = (
  doc: DocumentView<C4Document | C4BetaDocument>
): doc is DocumentView<C4BetaDocument> => {
  const { model } = doc.result;
  return typeof model === 'object' && model !== null && isC4Beta(model);
};

/**
 * The C4 facet. It parses a `c4-beta` header with the c4-beta parser (spec #730); the rest of its
 * language knowledge is legacy C4's until T6.
 */
export const c4Language: LanguageFacet<C4Document | C4BetaDocument> = {
  id: 'c4',
  parse: (text, options) =>
    detectC4Beta(text) ? parseC4Beta(text, options) : parseC4(text, options),
  categories,
  namespaces: [['element'], ['boundary']],
  // An alias no macro defines (an unknown relation end, D457) has no definition.
  declaredOnly: true,
  isValidId: invalidReason,
  completions: (probe, doc) =>
    isBeta(doc)
      ? c4betaCompletions(probe, doc)
      : c4Completions(probe, doc as DocumentView<C4Document>),
  hover: (at, doc) =>
    isBeta(doc) ? c4betaHover(at, doc) : c4Hover(at, doc as DocumentView<C4Document>),
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { c4Language as language };
