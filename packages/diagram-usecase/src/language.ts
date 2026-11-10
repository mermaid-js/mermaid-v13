/**
 * Usecase language facet (`@mermaid-js/diagram-usecase/language`, DESIGN §4.5, R-LANG-8, D89):
 * the parser entry and the tables the language service needs. Nothing reachable from here
 * imports the layout, a renderer or the plugin; the import-boundary lint and the bench's
 * language bundle spec hold that in place.
 *
 * Symbols (D477): actors, use cases, system boundaries, JSON tables and explicit relation ids
 * share one name space (v12 keeps one id map). The first occurrence by offset defines a name;
 * relation ends, `note for`, `class`, `style` and metadata targets refer to it. A quoted
 * element's symbol is its label, and a bare mention of its id is the same symbol (D191, #563):
 * a rename keeps the quotes and writes the new label's id at the bare mentions
 * (`facet/names.ts`). It refuses keywords, the PlantUML words and an existing name; a bare id
 * renamed to a name that is not `\w+` does not read back, so it is refused too. Folding comes
 * from the statement spans: `systemBoundary … end`, `accDescr { … }`, a JSON table and a
 * statement with a multi-line `@{ … }`.
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { usecaseCompletions } from './facet/completions.ts';
import { usecaseHover } from './facet/hover.ts';
import { invalidReason, NAME_SYNTAX } from './facet/names.ts';
import { usecaseCategories } from './generated/categories.ts';
import { parseUsecase } from './parser/index.ts';
import type { UsecaseDocument } from './parser/index.ts';

export { usecaseCategories } from './generated/categories.ts';
export { usecaseDocs } from './generated/docs.ts';
export { detectUsecase, parseUsecase, UsecaseTokenKind, usecaseTokens } from './parser/index.ts';
export type * from './parser/index.ts';

/** The usecase facet. */
export const usecaseLanguage: LanguageFacet<UsecaseDocument> = {
  id: 'usecase',
  parse: (text, options) => parseUsecase(text, options),
  categories: usecaseCategories,
  namespaces: [['actor', 'usecase', 'boundary', 'json', 'edge']],
  isValidId: invalidReason,
  nameSyntax: NAME_SYNTAX,
  completions: usecaseCompletions,
  hover: usecaseHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { usecaseLanguage as language };
