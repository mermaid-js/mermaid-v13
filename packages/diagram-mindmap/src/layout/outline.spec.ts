// v12's bang path as a closed outline, built as the shared cloud is.
import { describe, expect, it } from 'vitest';
import { outlineBox } from '@mermaid-js/shared/shapes/outline';
import { bangOutline } from './outline.ts';

describe('the bang outline', () => {
  it('closes at its start, the frame centred at 0, and bulges out of the frame', () => {
    const o = bangOutline(100, 40);
    expect(o.start).toEqual({ x: -50, y: -20 });
    const last = o.arcs.at(-1)!;
    expect(last.x).toBeCloseTo(-50, 9);
    expect(last.y).toBeCloseTo(-20, 9);
    const box = outlineBox(o);
    expect(box.x0).toBeLessThan(-50);
    expect(box.x1).toBeGreaterThan(50);
    expect(box.y0).toBeLessThan(-20);
    expect(box.y1).toBeGreaterThan(20);
  });

  it('takes its radius from the arc width, 0.15 of it, and 0.8 of that mid-side', () => {
    const o = bangOutline(100, 40, 80);
    expect(o.arcs[0]!.rx).toBeCloseTo(12, 9);
    expect(o.arcs[5]!.rx).toBeCloseTo(9.6, 9);
  });
});
