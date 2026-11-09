// Ported from v12 `swimlanes/__tests__/helpers.prepareLayout.spec.ts` (c9b12739f), on data the
// adapter builds from a `LayoutGraph`. Not ported: `look` and colour slots (renderer concerns,
// T2), and the shared-node lint: a `LayoutNode` has one parent, so a node in two lanes cannot
// reach the engine, and warnings belong to the renderer (D536).
import { describe, expect, it } from 'vitest';
import { toLayoutData } from '../adapter.ts';
import { DEFAULT_SWIMLANE_ID, prepareLayoutForSwimlanes } from '../helpers.ts';
import { type GraphSpec, layoutGraph } from './graphs.ts';

function prepare(spec: GraphSpec) {
  const data = toLayoutData(layoutGraph(spec));
  prepareLayoutForSwimlanes(data);
  return { data, node: (id: string) => data.nodes.find((n) => n.id === id) };
}

describe('prepareLayoutForSwimlanes', () => {
  it('marks group nodes with swimlane cluster shape', () => {
    const { node } = prepare({ lanes: { g1: ['n1'] } });
    expect(node('g1')?.shape).toBe('swimlane');
    expect(node('n1')?.shape).toBeUndefined();
  });

  it('assigns ungrouped content nodes to a synthetic default lane', () => {
    const { node } = prepare({ lanes: { lane1: ['grouped'] }, nodes: ['loose'] });
    expect(node(DEFAULT_SWIMLANE_ID)).toMatchObject({
      id: DEFAULT_SWIMLANE_ID,
      isGroup: true,
      shape: 'swimlane',
    });
    expect(node('loose')?.parentId).toBe(DEFAULT_SWIMLANE_ID);
    expect(node('grouped')?.parentId).toBe('lane1');
  });

  it('makes no default lane when every node is in a lane', () => {
    const { node } = prepare({ lanes: { lane1: ['a'] } });
    expect(node(DEFAULT_SWIMLANE_ID)).toBeUndefined();
  });

  it('only treats top-level groups as swimlane lanes', () => {
    const { node } = prepare({ lanes: { lane1: [] }, nested: { nested: ['lane1', ['child']] } });
    expect(node('lane1')?.shape).toBe('swimlane');
    expect(node('nested')?.shape).toBeUndefined();
  });

  it('gives lanes the diagram direction', () => {
    const { node } = prepare({ lanes: { lane1: ['a'] }, nodes: ['b'], direction: 'RL' });
    expect(node('lane1')?.direction).toBe('RL');
    expect(node(DEFAULT_SWIMLANE_ID)?.direction).toBe('RL');
  });

  it('keeps a lane the author left empty', () => {
    const { data } = prepare({ lanes: { lane1: ['a'], placeholder: [] } });
    expect(data.nodes.map((n) => n.id)).toContain('placeholder');
  });
});
