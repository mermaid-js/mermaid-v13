/**
 * The ishikawa AST ids (D497), built by the parser and read by the facet's hover: `effect`, and
 * `cause:<i>.<j>…` for a cause, its 1-based position in the tree.
 */

/** The effect's AST id. */
export const EFFECT_ID = 'effect';

const CAUSE = 'cause:';

/** The id of the `n`-th (1-based) cause under `parent`, the effect's id or a cause's. */
export const causeId = (parent: string, n: number): string =>
  parent === EFFECT_ID ? `${CAUSE}${n}` : `${parent}.${n}`;

/** The 1-based tree position a cause's id names: `cause:2.1` is `[2, 1]`. */
export const positionOf = (id: string): number[] => id.slice(CAUSE.length).split('.').map(Number);
