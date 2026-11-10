// Ported from v12 `swimlanes/__tests__/portSeparation.spec.ts` (c9b12739f). Changed: the fixture
// is its v13 capture laid out with v12's viewer sizes (`viewerSizedLayout.ts`), synchronously.
import { describe, expect, it } from 'vitest';
import type { LayoutData } from '../layoutData.ts';
import { VIEWER_SIZES_13_DISAGREE_EXITS_B_C_D } from './viewerMeasuredSizes.ts';
import { layOutFixture } from './viewerSizedLayout.ts';

interface Pt {
  x: number;
  y: number;
}

const SAME_POINT = 1;
const MIN_SHARED_RUN = 1;

const distance = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function sharedRun(a: Pt[], b: Pt[]): number {
  let run = 0;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const [a0, a1, b0, b1] = [a[i - 1]!, a[i]!, b[j - 1]!, b[j]!];
      const horizontal = a1.y === a0.y && b1.y === b0.y && a1.y === b1.y;
      const vertical = a1.x === a0.x && b1.x === b0.x && a1.x === b1.x;
      if (horizontal || vertical) {
        const axis = horizontal ? 'x' : 'y';
        const lo = Math.max(Math.min(a1[axis], a0[axis]), Math.min(b1[axis], b0[axis]));
        const hi = Math.min(Math.max(a1[axis], a0[axis]), Math.max(b1[axis], b0[axis]));
        run += Math.max(0, hi - lo);
      }
    }
  }
  return run;
}

function incomingAgainstOutgoing(layout: LayoutData, nodeId: string) {
  const edges = layout.edges.filter((e) => e.points?.length);
  return edges
    .filter((e) => e.end === nodeId)
    .flatMap((incoming) =>
      edges.filter((e) => e.start === nodeId).map((outgoing) => ({ incoming, outgoing }))
    );
}

describe('an incoming and an outgoing edge on a non-rectangular node', () => {
  it('13-disagree-exits-b-c-d: never end where, or run along where, B -> C leaves B', () => {
    const layout = layOutFixture('13-disagree-exits-b-c-d', VIEWER_SIZES_13_DISAGREE_EXITS_B_C_D);
    const pairs = incomingAgainstOutgoing(layout, 'B');
    expect(pairs.length).toBeGreaterThan(0);
    for (const { incoming, outgoing } of pairs) {
      const inPts = incoming.points!;
      const outPts = outgoing.points!;
      expect(
        distance(inPts.at(-1)!, outPts[0]!),
        `${incoming.id} ends on ${outgoing.id}`
      ).toBeGreaterThan(SAME_POINT);
      expect(sharedRun(inPts, outPts), `${incoming.id} runs along ${outgoing.id}`).toBeLessThan(
        MIN_SHARED_RUN
      );
    }
  });
});
