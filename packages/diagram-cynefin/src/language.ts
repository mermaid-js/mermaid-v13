/**
 * Cynefin language facet (`@mermaid-js/diagram-cynefin/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout or a renderer; the import-boundary lint and the bench's language bundle
 * spec hold that in place.
 *
 * Symbols (D367): each domain name is a `domain` symbol. Its first block defines it; later
 * blocks and both ends of a transition refer to it, so definition and references work. A
 * domain no block declares has no definition (`declaredOnly`); its mentions are references. Items
 * are not symbols (labels repeat across domains). Rename is refused: the five names are fixed,
 * so `isValidId` takes no new name. Domain blocks (from the name to the
 * last item) and `accDescr { … }` fold from the parser's statement spans.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { cynefinCompletions } from './facet/completions.ts';
import { cynefinHover } from './facet/hover.ts';
import { cynefinCategories } from './generated/categories.ts';
import { CYNEFIN_DOMAIN_NAMES } from './model.ts';
import { parseCynefin } from './parser/index.ts';
import { listOf } from './parser/parser.ts';
import type { CynefinDocument } from './parser/index.ts';

export { cynefinCategories } from './generated/categories.ts';
export { cynefinDocs } from './generated/docs.ts';
export { CynefinTokenKind, cynefinTokens, detectCynefin, parseCynefin } from './parser/index.ts';
export type * from './parser/index.ts';

const FIXED = `Domain names are fixed: a cynefin diagram has the five domains ${listOf(CYNEFIN_DOMAIN_NAMES.map((n) => `\`${n}\``))}, so a domain cannot be renamed.`;

/** The cynefin facet. */
export const cynefinLanguage: LanguageFacet<CynefinDocument> = {
  id: 'cynefin',
  parse: (text, options) => parseCynefin(text, options),
  categories: cynefinCategories,
  namespaces: [['domain']],
  // D367: the first block defines a domain; one named only by transitions has no definition.
  declaredOnly: true,
  // D367: the only symbols are the five fixed domain names, so every new name is refused.
  isValidId: () => FIXED,
  completions: cynefinCompletions,
  hover: cynefinHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { cynefinLanguage as language };
