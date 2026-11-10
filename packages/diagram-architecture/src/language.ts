/**
 * Architecture language facet (`@mermaid-js/diagram-architecture/language`, DESIGN §4.5,
 * R-LANG-8, D89): the parser entry and the tables the language service needs. Nothing reachable
 * from here imports the layout or the renderer; the import-boundary lint and the bench's
 * language bundle spec hold that in place.
 *
 * Symbols (D508): each id is a symbol of kind `service`, `junction` or `group`, as the
 * declaration that registered it in v12's order (groups first) says, defined there and
 * referenced from edges, `in`, `align` and any other declaration of the id. The three kinds
 * share one namespace, so a rename changes every occurrence and, through the service's clash
 * check, refuses an id already in use; `isValidId` refuses a name v12 cannot lex as an id
 * (`facet/names.ts`). A name nothing registered has no symbol.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { architectureCompletions } from './facet/completions.ts';
import { architectureHover } from './facet/hover.ts';
import { idReason } from './facet/names.ts';
import { architectureCategories } from './generated/categories.ts';
import { parseArchitecture } from './parser/index.ts';
import type { ArchitectureDocument } from './parser/index.ts';

export { architectureCategories } from './generated/categories.ts';
export { architectureDocs } from './generated/docs.ts';
export {
  architectureTokens,
  ArchitectureTokenKind,
  detectArchitecture,
  parseArchitecture,
} from './parser/index.ts';
export type * from './parser/index.ts';
export { BUILTIN_ICON_NAMES } from './facet/tables.ts';

/** The architecture facet. */
export const architectureLanguage: LanguageFacet<ArchitectureDocument> = {
  id: 'architecture',
  parse: (text, options) => parseArchitecture(text, options),
  categories: architectureCategories,
  namespaces: [['service', 'junction', 'group']],
  isValidId: (name) => idReason(name),
  completions: architectureCompletions,
  hover: architectureHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { architectureLanguage as language };
