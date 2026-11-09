// Ported from v12 `swimlanes/__tests__/lanes.spec.ts` (c9b12739f), without the pool cases (D531),
// on the internal nodes the adapter builds from a `LayoutGraph`. Not ported: "one definition of a
// lane", which scans the engine's sources from disk; core's specs have no Node APIs.
import { describe, expect, it } from 'vitest';
import { toLayoutData } from '../adapter.ts';
import type { Node } from '../layoutData.ts';
import { buildLaneModel } from '../lanes.ts';
import { layoutGraph } from './graphs.ts';

describe('buildLaneModel', () => {
  const model = buildLaneModel(
    toLayoutData(
      layoutGraph({
        lanes: { sales: ['a'], ops: [] },
        nested: { nested: ['ops', ['b']] },
        nodes: ['loose'],
      })
    ).nodes
  );

  it('treats a group with no parent as a lane', () => {
    expect(model.isLane('sales')).toBe(true);
    expect(model.isLane('ops')).toBe(true);
  });

  it('does not treat a nested group as a lane', () => {
    expect(model.isLane('nested')).toBe(false);
  });

  it('does not treat content as a lane', () => {
    expect(model.isLane('a')).toBe(false);
    expect(model.isLane('loose')).toBe(false);
  });

  it('resolves content to its lane', () => {
    expect(model.laneIdOf('a')).toBe('sales');
  });

  it('resolves content nested deeper than the lane to the outermost container', () => {
    expect(model.laneIdOf('b')).toBe('ops');
  });

  it('resolves a lane itself to null, so a band is distinguishable from its content', () => {
    expect(model.laneIdOf('sales')).toBeNull();
  });

  it('resolves a nested group to its lane', () => {
    expect(model.laneIdOf('nested')).toBe('ops');
  });

  it('returns null for a node outside every lane', () => {
    // Before `prepareLayoutForSwimlanes` moves it into the default lane.
    expect(model.laneIdOf('loose')).toBeNull();
  });

  it('returns null for an id that is not in the graph', () => {
    expect(model.laneIdOf('missing')).toBeNull();
    expect(model.isLane('missing')).toBe(false);
  });

  it('survives a malformed parent cycle rather than hanging', () => {
    // A `LayoutGraph` cannot express one, so the internal nodes are written out.
    const a: Node = { id: 'a', isGroup: true, parentId: 'b' };
    const b: Node = { id: 'b', isGroup: true, parentId: 'a' };
    const cyclic = buildLaneModel([a, b]);
    expect(cyclic.isLane('a')).toBe(false);
    expect(cyclic.laneIdOf('a')).toBeNull();
  });
});
