/**
 * `@mermaid-js/diagram-railroad`: the railroad diagram plugin (spec #526), in progress. One
 * package reads v12's four notations (IR, EBNF, ABNF, PEG) as four manifest types (D511), each
 * with its own parser onto one model. T2 (#610): the parsers, detection, the model and the AST.
 * The layout, renderer and manifest land with T3 to T5. The lexers and what only the
 * conformance gates read are in `./testing` (#608).
 */
export { detectRailroad, parseRailroad, RAILROAD_HEADERS, RULE_SYMBOL } from './parser/index.ts';
export type {
  RailroadDocument,
  RailroadExpressionNode,
  RailroadHeaderNode,
  RailroadParseOptions,
  RailroadParseResult,
  RailroadRuleNode,
  RailroadStatementNode,
  RailroadTextNode,
} from './parser/index.ts';
export type {
  RailroadChoice,
  RailroadModel,
  RailroadNode,
  RailroadNodeKind,
  RailroadNonterminal,
  RailroadNotation,
  RailroadOptional,
  RailroadRepetition,
  RailroadRule,
  RailroadSequence,
  RailroadSpecial,
  RailroadTerminal,
} from './model.ts';
