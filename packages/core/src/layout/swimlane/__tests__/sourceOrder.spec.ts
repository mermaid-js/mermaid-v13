// Ported from v12 `swimlanes/__tests__/sourceOrder.spec.ts` (c9b12739f): v12 parsed swimlane
// source; the engine takes the `LayoutGraph` such a source gives, nodes in source order.
import { describe, expect, it } from 'vitest';
import type { LayoutModel } from '../../types.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { type GraphSpec, layoutGraph } from './graphs.ts';

const layOut = (spec: GraphSpec) =>
  swimlaneLayout(
    layoutGraph({ size: { width: 80, height: 40 }, spacing: { node: 40, rank: 100 }, ...spec })
  );

function contentOrder(model: LayoutModel, axis: 'x' | 'y'): string[] {
  return [...model.nodes].sort(([, a], [, b]) => a[axis] - b[axis]).map(([id]) => id);
}

const DAYS = ['Wednesday', 'Tuesday', 'Friday', 'Monday', 'Thursday'];

describe('Swimlanes — unconnected nodes keep source order (#8355)', () => {
  it('two nodes in one lane (TB)', () => {
    expect(contentOrder(layOut({ lanes: { s1: ['Sunday', 'Monday'] } }), 'y')).toEqual([
      'Sunday',
      'Monday',
    ]);
  });

  it('five nodes in one lane (TB)', () => {
    expect(contentOrder(layOut({ lanes: { s1: DAYS } }), 'y')).toEqual(DAYS);
  });

  it('unconnected nodes in two lanes', () => {
    const order = contentOrder(
      layOut({ lanes: { s1: ['Sunday', 'Monday'], s2: ['Zeta', 'Alpha'] } }),
      'y'
    );
    expect(order.indexOf('Sunday')).toBeLessThan(order.indexOf('Monday'));
    expect(order.indexOf('Zeta')).toBeLessThan(order.indexOf('Alpha'));
  });

  it('five nodes in one lane (LR)', () => {
    expect(contentOrder(layOut({ lanes: { s1: DAYS }, direction: 'LR' }), 'x')).toEqual(DAYS);
  });
});
