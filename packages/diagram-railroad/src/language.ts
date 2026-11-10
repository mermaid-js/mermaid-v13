// cspell:words nonterminals nonterminal
/**
 * Railroad language facet (`@mermaid-js/diagram-railroad/language`, DESIGN §4.5, R-LANG-8, D89):
 * one facet for the four notations (D511). The four manifest types load it alike; each parse
 * reads the text in the notation its header names, and completion, hover and the categories
 * follow that notation. Nothing reachable from here imports the layout or the renderer: the
 * import-boundary lint holds that now; the bench's language bundle spec checks the bundle
 * against `workspace.yaml` `languageBundle` once T5 (#615) adds the manifest (it skips a
 * package without one).
 *
 * Symbols (D517): each rule name is a `rule` symbol, defined by its rule (the first one when
 * the name is defined again, and also while the rule fails to parse) and referred to by every
 * nonterminal naming it; a nonterminal
 * naming no rule is an unresolved reference, with a warning. Rename refuses a name no notation
 * reads as one name or one starting with `title` (`isValidId`), a name the notation's lexer
 * reads otherwise (an ABNF name with `_`, an IR keyword: the read-back check), an existing
 * rule name (the clash check), and any rename while a broken rule holds a name the parser
 * cannot place (`keepFailedRules`). D513's hints are `info` diagnostics (`facet/parse.ts`).
 */
import type { LanguageFacet } from '@mermaid-js/core/parser-kit';
import { railroadCompletions } from './facet/completions.ts';
import { railroadHover } from './facet/hover.ts';
import { nameReason } from './facet/names.ts';
import { parseForLanguage } from './facet/parse.ts';
import { RAILROAD_CATEGORIES } from './facet/tables.ts';
import { RULE_SYMBOL } from './parser/base.ts';
import type { RailroadDocument } from './parser/ast.ts';

export {
  RAILROAD_SEMI_COMMENT,
  RAILROAD_TITLE_PREFIX,
  RAILROAD_TITLE_RULE,
  RAILROAD_UNDEFINED_RULE,
} from './facet/parse.ts';
export { NOTATION_CATEGORIES, NOTATION_DOCS, RAILROAD_CATEGORIES } from './facet/tables.ts';
export { detectRailroad, parseRailroad, RailroadTokenKind } from './parser/index.ts';
export type * from './parser/index.ts';

/** The railroad facet, for the four notations. */
export const railroadLanguage: LanguageFacet<RailroadDocument> = {
  id: 'railroad',
  parse: (text, options) => parseForLanguage(text, options),
  categories: RAILROAD_CATEGORIES,
  namespaces: [[RULE_SYMBOL]],
  // Only a rule defines its name: a name only nonterminals use has no definition (D517).
  declaredOnly: true,
  isValidId: (name) => nameReason(name),
  completions: railroadCompletions,
  hover: railroadHover,
};

/** The facet under the fixed name the language service imports (manifest `language`, D89). */
export { railroadLanguage as language };
