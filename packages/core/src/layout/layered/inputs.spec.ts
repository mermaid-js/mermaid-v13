import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  EDGE_INPUTS,
  layoutInputs,
  ledge,
  lnode,
  NODE_INPUTS,
  type LEdge,
  type LNode,
} from './layered.ts';

// The compound layout reuses a level's layout when `layoutInputs` is unchanged, so every field
// must be either an input or an output, and `layoutInputs` must read every input. A new field
// fails here until it is listed as an input (NODE_INPUTS, EDGE_INPUTS) or an output, and an
// input fails until `layoutInputs` reads it, in the order of its list.

const NODE_OUTPUTS = ['x', 'y', 'rank'] as const;
const EDGE_OUTPUTS = ['reversed', 'points', 'labelX', 'labelY'] as const;

type NodeListed = (typeof NODE_INPUTS)[number] | (typeof NODE_OUTPUTS)[number];
type EdgeListed = (typeof EDGE_INPUTS)[number] | (typeof EDGE_OUTPUTS)[number];

// Every input set to a value of its own: numbers count up from `from`, flags alternate.
function distinct<T extends object>(item: T, fields: readonly (keyof T)[], from: number): T {
  fields.forEach((f, i) => {
    (item as Record<keyof T, unknown>)[f] = typeof item[f] === 'boolean' ? i % 2 === 0 : from + i;
  });
  return item;
}

const nodeInputs = (n: LNode): number[] => NODE_INPUTS.map((f) => n[f]);
const edgeInputs = (e: LEdge): number[] => EDGE_INPUTS.map((f) => +e[f]);

describe('layered inputs', () => {
  it('lists every field as an input or an output', () => {
    // At the type level too, so that an optional field, which `lnode` and `ledge` may leave
    // out, fails to typecheck until it is listed.
    expectTypeOf<Exclude<keyof LNode, NodeListed>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof LEdge, EdgeListed>>().toEqualTypeOf<never>();
    expect(Object.keys(lnode(1, 1)).sort()).toEqual([...NODE_INPUTS, ...NODE_OUTPUTS].sort());
    expect(Object.keys(ledge(0, 1)).sort()).toEqual([...EDGE_INPUTS, ...EDGE_OUTPUTS].sort());
  });

  it('reads every listed input, in order, node by node and then edge by edge', () => {
    const a = distinct(lnode(1, 1), NODE_INPUTS, 10);
    const b = distinct(lnode(1, 1), NODE_INPUTS, 30);
    const e = distinct(ledge(0, 1), EDGE_INPUTS, 50);
    const f = distinct(ledge(0, 1), EDGE_INPUTS, 70);
    f.tailFixed = !e.tailFixed;
    f.headFixed = !e.headFixed;
    expect(layoutInputs([a, b], [e, f])).toEqual([
      ...nodeInputs(a),
      ...nodeInputs(b),
      ...edgeInputs(e),
      ...edgeInputs(f),
    ]);
  });

  it('changes when any one input changes, and not when an output does', () => {
    const key = (n: LNode, e: LEdge): number[] => layoutInputs([n], [e]);
    const n0 = distinct(lnode(1, 1), NODE_INPUTS, 10);
    const e0 = distinct(ledge(0, 1), EDGE_INPUTS, 50);
    const base = key(n0, e0);
    for (const f of NODE_INPUTS) expect(key({ ...n0, [f]: n0[f] + 100 }, e0), f).not.toEqual(base);
    for (const f of EDGE_INPUTS) {
      const v = e0[f];
      const changed = typeof v === 'boolean' ? !v : v + 100;
      expect(key(n0, { ...e0, [f]: changed }), f).not.toEqual(base);
    }
    expect(key({ ...n0, x: 5, y: 6, rank: 7 }, { ...e0, reversed: true, points: [1, 2] })).toEqual(
      base
    );
  });
});
