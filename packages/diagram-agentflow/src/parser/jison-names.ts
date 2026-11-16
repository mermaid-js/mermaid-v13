import { flowJisonNames } from '@mermaid-js/shared/parser/flow';
import { T } from './tokens.ts';

/**
 * The v12 `agentflow.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry (`ShapeDataEnd`, `ClickKeyword`, `Kind.Comment`, `Kind.Directive`) match a jison
 * rule that returns no token.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  .../* @__PURE__ */ flowJisonNames(T),
  [T.Flow]: 'flow',
  [T.Connector]: 'connector',
  [T.Global]: 'global',
  [T.Comment]: 'COMMENT',
};
