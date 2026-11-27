// Subgraph nesting as v12's FlowDB.getData read it: which subgraph holds what, which ones are
// collapsed, how deep each cluster sits, which direction a node flows in, and the palette
// order. Membership can form cycles (v12 accepted them); every walk stops at a repeat.
import type { Dir } from '@mermaid-js/core/layout';
import type { FlowModel, FlowModelSubgraph } from '../parser/index.ts';

const DIRS: Readonly<Record<string, Dir>> = { TB: 'TB', TD: 'TB', BT: 'BT', LR: 'LR', RL: 'RL' };
export const dirOf = (d: string | undefined): Dir | undefined =>
  d ? DIRS[d.toUpperCase()] : undefined;

export interface Nesting {
  readonly subgraphs: ReadonlyMap<string, FlowModelSubgraph>;
  /** A subgraph's parent subgraph. */
  readonly sgParent: ReadonlyMap<string, string>;
  /** What a collapsed subgraph stands in for, mapped to it. */
  readonly collapsedInto: ReadonlyMap<string, string>;
  /** The subgraph a node or cluster is drawn in. */
  readonly parentOf: ReadonlyMap<string, string>;
  isCollapsed(id: string): boolean;
  /** How many clusters hold `id`. */
  depthOf(id: string): number;
  /** The direction `id` flows in: its nearest subgraph's own, else the diagram's. */
  flowDir(id: string): Dir;
  /** Each subgraph's place in source order (pre-order over the nesting forest). */
  readonly order: ReadonlyMap<string, number>;
}

export function nesting(model: FlowModel, rootDir: Dir): Nesting {
  // A subgraph listed in another one's members is its child.
  const subgraphs = new Map<string, FlowModelSubgraph>();
  for (const sg of model.subgraphs) subgraphs.set(sg.id, sg);
  const sgParent = new Map<string, string>();
  for (const sg of model.subgraphs) {
    for (const id of sg.nodes) if (subgraphs.has(id)) sgParent.set(id, sg.id);
  }
  const isCollapsed = (id: string): boolean => subgraphs.get(id)?.metadata?.view === 'collapsed';
  const collapsedInto = collapsed(model, sgParent, isCollapsed);

  // The first subgraph that lists a member is its parent (v12 walks them last to first).
  const parentOf = new Map<string, string>();
  for (let i = model.subgraphs.length - 1; i >= 0; i--) {
    const sg = model.subgraphs[i]!;
    if (collapsedInto.has(sg.id)) continue;
    for (const id of sg.nodes) parentOf.set(id, sg.id);
  }
  const own = (p: string) => dirOf(subgraphs.get(p)?.dir);
  const straight = acyclic(parentOf);
  const depthOf = straight
    ? upward(parentOf, 0, (_p, above) => above + 1)
    : (id: string) => {
        let d = 0;
        walkUp(parentOf, id, () => void d++);
        return d;
      };
  const flowDir = straight
    ? upward<Dir>(parentOf, rootDir, (p, above) => own(p) ?? above)
    : (id: string) => {
        let dir: Dir | undefined;
        walkUp(parentOf, id, (p) => (dir = own(p)) !== undefined);
        return dir ?? rootDir;
      };
  return {
    subgraphs,
    sgParent,
    collapsedInto,
    parentOf,
    isCollapsed,
    depthOf,
    flowDir,
    order: paletteOrder(model, sgParent),
  };
}

/** Collapsed subgraphs (`id@{ view: collapsed }`) stand in for everything inside them. */
function collapsed(
  model: FlowModel,
  sgParent: ReadonlyMap<string, string>,
  isCollapsed: (id: string) => boolean
): Map<string, string> {
  const into = new Map<string, string>();
  for (const sg of model.subgraphs) {
    let outer = isCollapsed(sg.id) ? sg.id : undefined;
    walkUp(sgParent, sg.id, (p) => void (isCollapsed(p) && (outer = p)), true);
    if (outer === undefined) continue;
    if (sg.id !== outer) into.set(sg.id, outer);
    for (const id of sg.nodes) if (id !== outer) into.set(id, outer);
  }
  return into;
}

/**
 * Palette order follows the source. `model.subgraphs` is in closing order (a nested subgraph
 * lands before its parent), so walk the nesting forest pre-order like v12. Subgraphs that only
 * sit in a membership cycle have no root; they are numbered last.
 */
function paletteOrder(
  model: FlowModel,
  sgParent: ReadonlyMap<string, string>
): Map<string, number> {
  const order = new Map<string, number>();
  const childrenOf = new Map<string, string[]>();
  for (const sg of model.subgraphs) {
    const p = sgParent.get(sg.id);
    if (p === undefined) continue;
    const list = childrenOf.get(p);
    if (list) list.push(sg.id);
    else childrenOf.set(p, [sg.id]);
  }
  const walk = (id: string): void => {
    if (order.has(id)) return;
    order.set(id, order.size);
    for (const c of childrenOf.get(id) ?? []) walk(c);
  };
  for (const sg of model.subgraphs) if (!sgParent.has(sg.id)) walk(sg.id);
  for (const sg of model.subgraphs) walk(sg.id);
  return order;
}

/**
 * Calls `visit` on each ancestor of `id`, nearest first, until it returns true or an ancestor
 * repeats. With `self`, a repeat of `id` itself also ends the walk.
 */
function walkUp(
  parents: ReadonlyMap<string, string>,
  id: string,
  visit: (p: string) => boolean | void,
  self = false
): void {
  const seen = new Set<string>();
  if (self) seen.add(id);
  for (let p = parents.get(id); p !== undefined && !seen.has(p); p = parents.get(p)) {
    seen.add(p);
    if (visit(p) === true) return;
  }
}

/** Whether following `parents` from any id ends. */
function acyclic(parents: ReadonlyMap<string, string>): boolean {
  const done = new Set<string>();
  for (const start of parents.keys()) {
    const path = new Set<string>();
    let x: string | undefined = start;
    while (x !== undefined && !done.has(x)) {
      if (path.has(x)) return false;
      path.add(x);
      x = parents.get(x);
    }
    for (const y of path) done.add(y);
  }
  return true;
}

/**
 * `f(id)` = `base` at a root, else `step(parent, f(parent))`, memoised and without recursion.
 * Only for `parents` with no cycle. `T` excludes `undefined`, so no memoised value is one and
 * `memo.get` giving `undefined` is a miss. (Were one `undefined`, it would only be worked out
 * again, to the same value: the walk ends at a root, as `parents` has no cycle.)
 */
function upward<T extends NonNullable<unknown>>(
  parents: ReadonlyMap<string, string>,
  base: T,
  step: (parent: string, above: T) => T
): (id: string) => T {
  if (parents.size === 0) return () => base;
  const memo = new Map<string, T>();
  return (id) => {
    const chain: string[] = [];
    let x = id;
    let value = memo.get(x);
    while (value === undefined) {
      const p = parents.get(x);
      if (p === undefined) {
        value = base;
        memo.set(x, value);
        break;
      }
      chain.push(x);
      x = p;
      value = memo.get(x);
    }
    let v = value;
    for (let i = chain.length - 1; i >= 0; i--) {
      const c = chain[i]!;
      v = step(parents.get(c)!, v);
      memo.set(c, v);
    }
    return v;
  };
}
