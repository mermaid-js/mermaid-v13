// Ported from v12 `swimlanes/__tests__/routeTouches.spec.ts` (c9b12739f). Changed: the sweep is
// over every v13 capture (`ddlt.fixtures.ts`), each laid out with the viewer sizes v12 used for
// it (`viewerSizedLayout.ts`), so `UNRESOLVED_TOUCHES` lists what v13's geometry leaves.
import { describe, expect, it } from 'vitest';
import { EDGE_ROUTING } from '../config.ts';
import { DDLT_FIXTURES } from './ddlt.fixtures.ts';
import { VISIBLE_ROUTE_GAP, routeTouches } from './routeTouches.ts';
import {
  VIEWER_SIZES_13_DISAGREE_EXITS_B_C_D,
  VIEWER_SIZES_8_QUERY_PROCESS_2,
  VIEWER_SIZES_QUERY_PROCESS,
  VIEWER_SIZES_SALES_PROCESS,
} from './viewerMeasuredSizes.ts';
import unresolvedTouches from './unresolvedTouches.json' with { type: 'json' };
import { layOutFixture, layOutMeasured, type NodeSizes } from './viewerSizedLayout.ts';

interface UnresolvedTouch {
  touch: string;
  /** `#<issue>` or `D<n>`. */
  ref: string;
}

// Fixtures the dev viewer measures differently from their captured sizes files.
const MEASURED_IN_VIEWER: Record<string, NodeSizes> = {
  '13-disagree-exits-b-c-d': VIEWER_SIZES_13_DISAGREE_EXITS_B_C_D,
  '8-query-process-2': VIEWER_SIZES_8_QUERY_PROCESS_2,
  'query-process': VIEWER_SIZES_QUERY_PROCESS,
};

// Touches no stage resolves yet. The router leaves two of them in `pebr-2-edge-intrudes-lane-label`:
// two tracks in one channel end 3.3px apart, and no later stage moves a corner. v12 listed
// `14-messy-layout` and `6-legal-constr-sales`; v13 resolves the first, and a detour rescued into
// a straight line now keeps the visible gap from a corner of the route beside it
// (`siblingRescueTouch.spec.ts`), which clears the second, `5-car-fun-sales-wide-tb`,
// `mermaid-work` and `regressions/title-band-rails` (#678). The others were not in v12's list
// (v12 swept only fixtures with sizes files).
//
// The list is `unresolvedTouches.json`: each touch names the issue or decision that covers it
// (`ref`), and the allowlist ratchet (conformance `allowlists.spec.ts`, #695) fails a touch
// whose issue is closed. A new touch takes a reference of its own.
const UNRESOLVED_TOUCHES: Record<string, UnresolvedTouch[] | undefined> = unresolvedTouches;

describe('route touches in the swimlane fixtures', () => {
  it('treats a bend closer than the visible gap as touching in the router too', () => {
    expect(EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE).toBe(VISIBLE_ROUTE_GAP);
  });

  it.each(Object.keys(DDLT_FIXTURES).filter((id) => id !== 'sales-process'))(
    'lets the corner of one route touch another route only where none resolves it, in %s',
    (id) => {
      const layout = layOutFixture(id, MEASURED_IN_VIEWER[id]);
      expect(routeTouches(layout)).toEqual((UNRESOLVED_TOUCHES[id] ?? []).map((t) => t.touch));
    }
  );

  it('lists unresolved touches only for fixtures in the sweep, each with a reference', () => {
    for (const [id, touches] of Object.entries(unresolvedTouches)) {
      expect(Object.keys(DDLT_FIXTURES)).toContain(id);
      expect(touches.length).toBeGreaterThan(0);
      for (const t of touches) expect(t.ref, `${id}: ${t.touch}`).toMatch(/^(#\d+|D\d+)$/);
    }
  });

  it('never lets the corner of one route touch another route in sales-process', () => {
    const layout = layOutMeasured('sales-process', VIEWER_SIZES_SALES_PROCESS);
    expect(routeTouches(layout)).toEqual([]);
  });
});
