import { describe, expect, it } from 'vitest';
import { centroid, pieAngles, slicePath } from './arc.ts';

// Expected paths are d3-shape 3's `arc()` output for the same input, in core's path format.
describe('d3 arc, re-implemented', () => {
  it('a quarter from 12 o’clock', () => {
    expect(slicePath({ startAngle: 0, endAngle: Math.PI / 2 }, 0, 100)).toBe(
      'M0,-100A100,100 0 0,1 100,0L0,0Z'
    );
  });

  it('a quarter of a donut', () => {
    expect(slicePath({ startAngle: 0, endAngle: Math.PI / 2 }, 50, 100)).toBe(
      'M0,-100A100,100 0 0,1 100,0L50,0A50,50 0 0,0 0,-50Z'
    );
  });

  it('more than half takes the large arc', () => {
    expect(slicePath({ startAngle: 0, endAngle: (3 * Math.PI) / 2 }, 0, 100)).toBe(
      'M0,-100A100,100 0 1,1 -100,0L0,0Z'
    );
  });

  it('the whole circle is two half arcs, a ring two more', () => {
    expect(slicePath({ startAngle: 0, endAngle: 2 * Math.PI }, 0, 100)).toBe(
      'M0,-100A100,100 0 1,1 0,100A100,100 0 1,1 0,-100Z'
    );
    expect(slicePath({ startAngle: 0, endAngle: 2 * Math.PI }, 50, 100)).toBe(
      'M0,-100A100,100 0 1,1 0,100A100,100 0 1,1 0,-100M0,-50A50,50 0 1,0 0,50A50,50 0 1,0 0,-50Z'
    );
  });

  it('pie() keeps input order and gives a zero sum zero angles', () => {
    expect(pieAngles([1, 3])).toEqual([
      { startAngle: 0, endAngle: Math.PI / 2 },
      { startAngle: Math.PI / 2, endAngle: 2 * Math.PI },
    ]);
    expect(pieAngles([0, 0])).toEqual([
      { startAngle: 0, endAngle: 0 },
      { startAngle: 0, endAngle: 0 },
    ]);
  });

  it('centroid() is the middle of the arc', () => {
    const c = centroid({ startAngle: 0, endAngle: Math.PI }, 10, 10);
    expect(c.x).toBeCloseTo(10);
    expect(c.y).toBeCloseTo(0);
  });
});
