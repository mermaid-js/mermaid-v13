// Ported from v12 `swimlanes/__tests__/lrTransform.emptyLane.spec.ts` (c9b12739f), on data the
// adapter builds from a `LayoutGraph`. The transform leaves an empty lane alone; the adapter then
// gives it a band of its own (see `swimlane.spec.ts`).
import { describe, expect, it } from 'vitest';
import { toLayoutData } from '../adapter.ts';
import { applyLrDirectionTransform } from '../direction/lrTransform.ts';
import { layoutGraph } from './graphs.ts';

describe('LR: a lane with no members', () => {
  it('is left as the layout left it', () => {
    const data = toLayoutData(
      layoutGraph({ lanes: { lane: ['a'], empty: [] }, size: { width: 80, height: 40 } })
    );
    const empty = data.nodes.find((n) => n.id === 'empty')!;
    Object.assign(empty, { x: 5, y: 6, width: 0, height: 0 });
    Object.assign(data.nodes.find((n) => n.id === 'a')!, { x: 0, y: 0 });

    applyLrDirectionTransform(data, 'LR');

    expect(empty).toMatchObject({ x: 5, y: 6, width: 0, height: 0 });
  });
});
