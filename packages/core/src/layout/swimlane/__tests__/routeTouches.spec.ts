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
import { layOutFixture, layOutMeasured, type NodeSizes } from './viewerSizedLayout.ts';

// Fixtures the dev viewer measures differently from their captured sizes files.
const MEASURED_IN_VIEWER: Record<string, NodeSizes> = {
  '13-disagree-exits-b-c-d': VIEWER_SIZES_13_DISAGREE_EXITS_B_C_D,
  '8-query-process-2': VIEWER_SIZES_8_QUERY_PROCESS_2,
  'query-process': VIEWER_SIZES_QUERY_PROCESS,
};

// Touches no stage resolves yet: two parallel tracks on one node, side by side, with a corner
// of one beside the other and no crossing between them. Updated for v13's geometry: v12 listed
// `14-messy-layout` (L_33a_39_0 on L_33b_39_0) and `6-legal-constr-sales` (L_D_E_0 on L_D_H_0),
// which v13 resolves; the same D -> E / D -> H pair now touches in `5-car-fun-sales-wide-tb`.
// `8-query-process-2` and `regressions/title-band-rails` were not in v12's list (v12 swept only
// fixtures with sizes files, and laid 8-query-process-2 out on v12 geometry): both are reported
// on #595 as expected failures. In 8-query-process-2, A2, E and B share a column and the two
// edges out of A2 turn 3px apart.
const UNRESOLVED_TOUCHES: Record<string, string[]> = {
  '5-car-fun-sales-wide-tb': ['L_D_E_0 turns at (242.6, 150.2) on L_D_H_0'],
  '8-query-process-2': [
    'L_A2_B_0 turns at (315.1, 252.9) on L_A2_E_0',
    'L_A2_E_0 turns at (315.1, 255.9) on L_A2_B_0',
  ],
  'regressions/title-band-rails': ['L_HE_CA_HE_Inv_0 turns at (524.1, 416.9) on L_B_HE_CA_0'],
};

describe('route touches in the swimlane fixtures', () => {
  it('treats a bend closer than the visible gap as touching in the router too', () => {
    expect(EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE).toBe(VISIBLE_ROUTE_GAP);
  });

  it.each(Object.keys(DDLT_FIXTURES).filter((id) => id !== 'sales-process'))(
    'lets the corner of one route touch another route only where none resolves it, in %s',
    (id) => {
      const layout = layOutFixture(id, MEASURED_IN_VIEWER[id]);
      expect(routeTouches(layout)).toEqual(UNRESOLVED_TOUCHES[id] ?? []);
    }
  );

  it('never lets the corner of one route touch another route in sales-process', () => {
    const layout = layOutMeasured('sales-process', VIEWER_SIZES_SALES_PROCESS);
    expect(routeTouches(layout)).toEqual([]);
  });
});
