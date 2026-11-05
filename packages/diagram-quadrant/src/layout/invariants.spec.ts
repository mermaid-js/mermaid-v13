import { describe, expect, it } from 'vitest';
import { layoutQuadrant } from './layout.ts';
import { quadrantLayoutViolations } from './invariants.ts';
import { axis, config, model, point, quadrants } from './fixtures.ts';
import type { QuadrantLayout } from './types.ts';

const full = () =>
  layoutQuadrant(
    model({
      title: 'T',
      quadrants: quadrants(),
      xAxis: axis('x', 'L', 'R'),
      yAxis: axis('y', 'B', 'T'),
      points: [point('A', '0', '0'), point('B', '1', '1'), point('C', '0.3', '0.7')],
    }),
    config({ yAxisPosition: 'right' })
  );

describe('quadrantLayoutViolations', () => {
  it('finds none in a laid-out chart', () => {
    expect(quadrantLayoutViolations(full())).toEqual([]);
  });

  it('reports a NaN', () => {
    const l = full();
    const broken: QuadrantLayout = { ...l, points: [{ ...l.points[0]!, cy: Number.NaN }] };
    expect(quadrantLayoutViolations(broken)).toEqual([
      'points[0].cy is not a finite number',
      'point pt:A lies outside the square',
    ]);
  });

  it('reports quadrants that do not tile the square', () => {
    const l = full();
    const [q1, ...rest] = l.quadrants;
    const broken: QuadrantLayout = { ...l, quadrants: [{ ...q1!, x: q1!.x + 1 }, ...rest] };
    expect(quadrantLayoutViolations(broken)).toEqual(['quadrant 1 does not tile the square']);
  });

  it('reports a point outside the square', () => {
    const l = full();
    const broken: QuadrantLayout = { ...l, points: [{ ...l.points[0]!, cx: l.points[0]!.cx - 1 }] };
    expect(quadrantLayoutViolations(broken)).toEqual(['point pt:A lies outside the square']);
  });
});
