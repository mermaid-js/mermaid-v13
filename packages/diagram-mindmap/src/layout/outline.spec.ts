// The box an elliptical arc covers (SVG 1.1 F.6), on arcs worked out by hand, and v12's cloud
// and bang paths as closed outlines.
import { describe, expect, it } from 'vitest';
import { arcBox, bangOutline, cloudOutline, outlineBox } from './outline.ts';

const arc = (rx: number, ry: number, rotation: number, sweep: boolean, x: number, y: number) => ({
  rx,
  ry,
  rotation,
  large: false,
  sweep,
  x,
  y,
});

const close = (a: Record<string, number>, b: Record<string, number>) => {
  for (const k of Object.keys(b)) expect(a[k], k).toBeCloseTo(b[k]!, 9);
};

describe('arcBox', () => {
  it('takes a half circle out to its radius on the side the sweep turns to', () => {
    // Clockwise on screen (y down) from (0,0) to (2,0) goes over the top.
    close({ ...arcBox({ x: 0, y: 0 }, arc(1, 1, 0, true, 2, 0)) }, { x0: 0, x1: 2, y0: -1, y1: 0 });
    close({ ...arcBox({ x: 0, y: 0 }, arc(1, 1, 0, false, 2, 0)) }, { x0: 0, x1: 2, y0: 0, y1: 1 });
  });

  it('scales radii too small for the chord up until they span it', () => {
    close({ ...arcBox({ x: 0, y: 0 }, arc(1, 1, 0, true, 4, 0)) }, { x0: 0, x1: 4, y0: -2, y1: 0 });
  });

  it('turns the ellipse by its rotation', () => {
    // rx 2 along the turned x axis, which points down: a half ellipse 1 wide to the right.
    close({ ...arcBox({ x: 0, y: 0 }, arc(2, 1, 90, true, 0, 4)) }, { x0: 0, x1: 1, y0: 0, y1: 4 });
  });

  it('counts only the extremes on the arc: a quarter circle reaches none', () => {
    close({ ...arcBox({ x: 1, y: 0 }, arc(1, 1, 0, true, 0, 1)) }, { x0: 0, x1: 1, y0: 0, y1: 1 });
  });

  it('draws a zero radius as a line', () => {
    expect(arcBox({ x: 0, y: 0 }, arc(0, 1, 0, true, 3, 4))).toEqual({
      x0: 0,
      y0: 0,
      x1: 3,
      y1: 4,
    });
  });
});

describe('cloud and bang outlines', () => {
  it.each([
    ['cloud', cloudOutline],
    ['bang', bangOutline],
  ])('%s closes at its start, the frame centred at 0, and bulges out of the frame', (_, f) => {
    const o = f(100, 40);
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

  it("cloud: the top rises a fifth of the width and the bottom drops 0.15 of it, as v12's path", () => {
    const box = outlineBox(cloudOutline(100, 40));
    // The top corners step up w·0.1 twice; the arcs bulge further still.
    expect(box.y0).toBeLessThan(-20 - 20);
    expect(box.y1).toBeGreaterThan(20 + 15);
  });
});
