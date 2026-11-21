import { loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonRule } from '../jison/oracle.ts';
import { loadOracle } from '../oracle.ts';
import type { Oracle } from '../oracle.ts';

/**
 * D621: flowchart takes v12 12.3.0's edge-id rule ahead of the oracle bump (D316). The oracle is
 * mermaid 12.2.0, whose `flow.jison` has the old rule; 12.3.0 changed it in a5060b1d8 and
 * 72f073244.
 */

/** The number of 12.2.0's LINK_ID rule, `[^\s\"]+\@(?=[^\{\"])`, among its lexer's rules. */
export const LINK_ID_RULE = 61;

/** 12.3.0's LINK_ID: the run also stops at `[ ] ( ) { } |`. */
export const LINK_ID_12_3 = /^(?:[^\s"[\](){}|]+@(?=[^{"]))/;

/** 12.2.0's lexer rules that D621 replaces, for `oracle.tokens(source, { rules })`. */
export const D621_RULES: Readonly<Record<number, JisonRule>> = {
  [LINK_ID_RULE]: (input) => LINK_ID_12_3.exec(input),
};

/**
 * The corpus sources 12.2.0's parser rejects and v13 accepts under D621: an edge id after shape
 * data and its blanks (12.3.0's `node shapeData spaceList`), by their id in the grammar
 * corpus (`./grammar/corpus.ts`). Each is listed in `divergences/flowchart.json`.
 */
export const D621_ACCEPTS: ReadonlySet<string> = new Set([
  'e2e/baseline/edges/edge-id-after-node.mmd',
  'v12-specs/parser/flow-edges.spec.js#8',
  'v12-specs/parser/flow-edges.spec.js#10',
]);

/**
 * mermaid\@12 with {@link D621_RULES} in its own lexer: 12.2.0's parser on the token stream
 * v13's lexer is gated on. It does not have 12.3.0's `node shapeData spaceList`, so it still
 * rejects {@link D621_ACCEPTS}.
 */
export async function d621Oracle(): Promise<Oracle> {
  const oracle = await loadOracle();
  const lexer = await loadJisonLexerOracle('flowchart');
  return {
    version: oracle.version,
    detect: (text) => oracle.detect(text),
    parse: (text, config) => lexer.withRules(D621_RULES, () => oracle.parse(text, config)),
  };
}
