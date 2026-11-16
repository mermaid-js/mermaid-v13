import { describe, expect, it } from 'vitest';
import { blockArrowPolygon } from './block-arrow.ts';
import { leafOutline, leafSize, type LeafShape, type Pads } from './leaf.ts';
import { clipOutline, outlineDistance, outlineExtent, type Outline } from './outline.ts';

const PADS: Pads = {
  node: { x: 16, y: 12 },
  r: 0,
  pad: 8,
  stadium: { x: 40, y: 24 },
  hexagon: { x: 70, y: 32 },
  hexagonSlant: 3.5,
  subroutine: { x: 28, y: 12 },
  cylinder: { x: 24, y: 24 },
  lean: { x: 16, y: 8 },
  odd: { x: 42, y: 24 },
  ringGap: 12,
  ringPad: 16,
  circlePad: 16,
  circleMin: 44,
};

describe('clipOutline', () => {
  it('meets a box on its side and a rounded corner on its arc', () => {
    const box: Outline = { kind: 'rect', width: 100, height: 40, rx: 0 };
    expect(clipOutline(box, 1, 0)).toEqual({ x: 50, y: 0 });
    expect(clipOutline(box, 0, -5)).toEqual({ x: 0, y: -20 });
    // Towards the corner of a 40 × 40 box with radius 10: the arc's middle, not the corner.
    const p = clipOutline({ kind: 'rect', width: 40, height: 40, rx: 10 }, 1, 1);
    const k = 10 + 10 * Math.SQRT1_2;
    expect(p.x).toBeCloseTo(k, 12);
    expect(p.y).toBeCloseTo(k, 12);
  });

  it('meets an ellipse, a polygon and a cylinder where they are', () => {
    expect(clipOutline({ kind: 'ellipse', rx: 30, ry: 10 }, 0, 1).y).toBeCloseTo(10, 12);
    const diamond: Outline = {
      kind: 'polygon',
      points: [
        { x: 0, y: -10 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
        { x: -10, y: 0 },
      ],
    };
    const d = clipOutline(diamond, 1, 1);
    expect(d.x).toBeCloseTo(5, 12);
    expect(d.y).toBeCloseTo(5, 12);
    // A cylinder 60 × 100 with caps 10 deep: straight up meets the top of the cap.
    const cyl: Outline = { kind: 'cylinder', width: 60, height: 100, ry: 10 };
    expect(clipOutline(cyl, 0, -1).y).toBeCloseTo(-50, 12);
    expect(clipOutline(cyl, 1, 0)).toEqual({ x: 30, y: 0 });
  });

  it('gives the centre for no direction or an outline with no area', () => {
    expect(clipOutline({ kind: 'rect', width: 10, height: 10, rx: 0 }, 0, 0)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clipOutline({ kind: 'polygon', points: [{ x: 0, y: 0 }] }, 1, 0)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

const SHAPES: LeafShape[] = [
  'rect',
  'stadium',
  'fr-rect',
  'cyl',
  'circle',
  'dbl-circ',
  'diam',
  'hex',
  'odd',
  'lean-r',
  'lean-l',
  'trap-b',
  'trap-t',
];

describe('every block shape', () => {
  const outlines: [string, Outline][] = [
    ...SHAPES.map((s): [string, Outline] => {
      const { w, h } = leafSize(s, 60, 20, PADS);
      return [s, leafOutline({ shape: s, width: w * 1.5, height: h, pads: PADS, rx: 5 })];
    }),
    ...['right', 'left', 'up', 'down', 'x', 'y', 'right,down'].map((d): [string, Outline] => [
      `block arrow ${d}`,
      {
        kind: 'polygon',
        points: blockArrowPolygon({
          directions: d.split(','),
          label: { width: 60, height: 20 },
          padding: 8,
          width: 120,
        }),
      },
    ]),
  ];

  it.each(outlines)(
    '%s: edges in every direction end on the outline, inside its extent',
    (name, o) => {
      const [x0, y0, x1, y1] = outlineExtent(o);
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * 2 * Math.PI + 0.01;
        const p = clipOutline(o, Math.cos(a), Math.sin(a));
        expect(outlineDistance(o, p)).toBeLessThan(1e-9);
        expect(p.x).toBeGreaterThanOrEqual(x0 - 1e-9);
        expect(p.x).toBeLessThanOrEqual(x1 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(y0 - 1e-9);
        expect(p.y).toBeLessThanOrEqual(y1 + 1e-9);
        // v12's two-way arrows are triangles with the centre on a side; the rest hold it inside.
        if (!name.includes(',')) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0);
      }
    }
  );
});
