/**
 * d3-hierarchy 3.1.2's `node.sum(d => d.value ?? 0)` at one node (`hierarchy/sum.js`): the
 * node's own value (`+value || 0`) plus its children's, added from the last child to the first
 * as d3 adds them, so a total is d3's to the bit. The layout (`layout/tiles.ts`) sums its tiles
 * with it and hover (`facet/values.ts`) the model's sections, so hover states the value the
 * renderer prints; this module imports nothing, so the language bundle holds no layout code.
 * d3-hierarchy: https://github.com/d3/d3-hierarchy, ISC License, Copyright 2010-2021 Mike Bostock.
 */

/** `own` (as d3's `+value || 0`) plus `valueOf` of each child, last child first. */
export function d3Sum<T>(
  own: number | undefined,
  children: readonly T[] | undefined,
  valueOf: (child: T) => number
): number {
  let value = +(own ?? 0) || 0;
  if (children) for (let i = children.length - 1; i >= 0; i--) value += valueOf(children[i]!);
  return value;
}
