import { flowJisonNames } from '@mermaid-js/shared/parser/flow';
import { T } from './tokens.ts';

/**
 * The v12 `flow.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5).
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  .../* @__PURE__ */ flowJisonNames(T),
  [T.Subgraph]: 'subgraph',
};
