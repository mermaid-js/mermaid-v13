// Ported from v12 `swimlanes/__tests__/terminalGeometry.spec.ts` (c9b12739f). Changed: the
// fixture is its v13 capture laid out with v12's viewer sizes (`viewerSizedLayout.ts`),
// synchronously, on the engine's internal data.
import { describe, expect, it } from 'vitest';
import type { LayoutData } from '../layoutData.ts';
import { countOrthogonalBends, dedupeConsecutivePoints } from '../direction/geometry.ts';
import { faceAxis, lastSegmentAxis, type Box } from './faceGeometry.ts';
import { VIEWER_SIZES_8_QUERY_PROCESS_2 } from './viewerMeasuredSizes.ts';
import { layOutFixture } from './viewerSizedLayout.ts';

function terminalViolations(layout: LayoutData): string[] {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const problems: string[] = [];
  for (const edge of layout.edges) {
    const node = byId.get(edge.end);
    const points = edge.points;
    if (!node || !points?.length) {
      continue;
    }
    const box = node as unknown as Box;
    const axis = faceAxis(box, points.at(-1)!);
    if (!axis) {
      problems.push(`${edge.id} ends off the boundary of ${edge.end}`);
    } else if (axis !== lastSegmentAxis(points)) {
      problems.push(`${edge.id} arrives along the face of ${edge.end}`);
    }
  }
  return problems;
}

const layout = () => layOutFixture('8-query-process-2', VIEWER_SIZES_8_QUERY_PROCESS_2);

/**
 * Expected failures with v13's capture (v13 label sizes and 20px group padding under v12's viewer
 * sizes), reported on #595. A2, E and B share one rank, one column, and A2 to E lands beside
 * E's vertex; E to G leaves beside E's bottom vertex, and A2 to E detours round A2's right.
 */
const KNOWN_TERMINAL_VIOLATIONS = ['L_A2_E_0 ends off the boundary of E'];

describe('where an edge ends on the node it points at', () => {
  it('8-query-process-2: every edge ends on its target, perpendicular to the face', () => {
    expect(terminalViolations(layout())).toEqual(KNOWN_TERMINAL_VIOLATIONS);
  });

  // Expected failure (see KNOWN_TERMINAL_VIOLATIONS): E -> G leaves beside the vertex.
  it.fails(
    '8-query-process-2: "No" leaves the diamond vertex and enters the middle of Investigate',
    () => {
      const data = layout();
      const byId = new Map(data.nodes.map((n) => [n.id, n]));
      const diamond = byId.get('E')!;
      const target = byId.get('G')!;
      const points = data.edges.find((e) => e.id === 'L_E_G_0')?.points ?? [];
      expect(points[0]).toEqual({ x: diamond.x, y: (diamond.y ?? 0) + (diamond.height ?? 0) / 2 });
      expect(points.at(-1)).toEqual({ x: target.x, y: (target.y ?? 0) + (target.height ?? 0) / 2 });
      expect(countOrthogonalBends(dedupeConsecutivePoints(points))).toBe(2);
    }
  );

  it('8-query-process-2: the moved "No" edge keeps its label on it and its endpoints ready to draw', () => {
    const data = layout();
    const edge = data.edges.find((e) => e.id === 'L_E_G_0');
    const label = data.nodes.find((n) => n.id === edge?.labelNodeId);
    const points = edge?.points ?? [];
    const route = dedupeConsecutivePoints(points);
    const onRoute = route.slice(1).some((b, i) => {
      const a = route[i]!;
      const within = (v: number, p: number, q: number) =>
        v >= Math.min(p, q) && v <= Math.max(p, q);
      return within(label?.x ?? NaN, a.x, b.x) && within(label?.y ?? NaN, a.y, b.y);
    });
    expect(onRoute).toBe(true);
    expect(points[1]).toEqual(points[0]);
    expect(points.at(-2)).toEqual(points.at(-1));
  });

  // Expected failure (see KNOWN_TERMINAL_VIOLATIONS): A2 -> E detours round A2's right.
  it.fails(
    '8-query-process-2: "No" from "Knows which team?" runs straight down into the diamond below it',
    () => {
      const data = layout();
      const byId = new Map(data.nodes.map((n) => [n.id, n]));
      const source = byId.get('A2')!;
      const target = byId.get('E')!;
      const points = data.edges.find((e) => e.id === 'L_A2_E_0')?.points ?? [];
      expect(dedupeConsecutivePoints(points)).toEqual([
        { x: source.x, y: (source.y ?? 0) + (source.height ?? 0) / 2 },
        { x: target.x, y: (target.y ?? 0) - (target.height ?? 0) / 2 },
      ]);
    }
  );
});
