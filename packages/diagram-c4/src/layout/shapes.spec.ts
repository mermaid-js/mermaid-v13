import { describe, expect, it } from 'vitest';
import { insideAlong, onOutline, personParts, type Outline } from './shapes.ts';
import type { Point } from './types.ts';

/**
 * `insideAlong` (#680), on its own: the room the router spreads repeated relations and
 * self-loops over. From a point inside an outline, the distances each way along a direction end
 * on the outline, whatever the pieces it is made of.
 */
const BOX = { x: 40, y: 20, width: 216, height: 72 };
/** A person is taller: its head (radius 0.23 of the width) sits on its body. */
const PERSON_BOX = { x: 40, y: 20, width: 216, height: 220 };
const FORMS: Outline['form'][] = [
  'rounded',
  'fr-rect',
  'frame',
  'cyl',
  'h-cyl',
  'person',
  'person-box',
];
/** How close an end must be to the outline: rounding only. */
const TOL = 1e-6;
/** Directions: across, down, and slanted both ways. */
const DIRECTIONS: Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 0.6, y: 0.8 },
  { x: -0.8, y: 0.6 },
];

const outline = (form: Outline['form']): Outline => ({
  ...(form === 'person' ? PERSON_BOX : BOX),
  form,
});
const at = (p: Point, n: Point, s: number): Point => ({ x: p.x + n.x * s, y: p.y + n.y * s });

describe('insideAlong (#680)', () => {
  it.each(FORMS)('ends on the outline of a %s, both ways, from points inside it', (form) => {
    const box = outline(form);
    // Below the middle, and points off it towards the lower right and the lower left.
    const points: Point[] = [
      { x: box.x + box.width / 2, y: box.y + box.height * 0.6 },
      { x: box.x + box.width * 0.8, y: box.y + box.height * 0.7 },
      { x: box.x + box.width * 0.3, y: box.y + box.height * 0.75 },
    ];
    for (const p of points)
      for (const n of DIRECTIONS) {
        const [back, forward] = insideAlong(box, p, n);
        expect(back, `${form} ${JSON.stringify([p, n])}`).toBeGreaterThan(0);
        expect(onOutline(box, at(p, n, forward), TOL), `${form} forward`).toBe(true);
        expect(onOutline(box, at(p, n, -back), TOL), `${form} back`).toBe(true);
      }
  });

  it('runs on into a piece the first one overlaps: from a person’s head down through its body', () => {
    const box = outline('person');
    const head = { x: box.x + box.width / 2, y: box.y + 2 };
    const [, forward] = insideAlong(box, head, { x: 0, y: 1 });
    expect(forward).toBeCloseTo(box.y + box.height - head.y, 9);
  });

  it('stops where the pieces stop overlapping, not at a piece further along', () => {
    // Up and to the left from just under the body's top: out of the body, then into the head.
    const box = outline('person');
    const { body } = personParts(box);
    const p = { x: box.x + box.width - 16, y: body.y + 4 };
    const n = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    const [, forward] = insideAlong(box, p, n);
    expect(at(p, n, forward).y).toBeCloseTo(body.y, 9);
  });

  it('counts the outline itself as inside: from a side, none outwards, all the way inwards', () => {
    const box = outline('fr-rect');
    expect(insideAlong(box, { x: BOX.x, y: BOX.y + 30 }, { x: 0, y: 1 })).toEqual([30, 42]);
    expect(insideAlong(box, { x: BOX.x + BOX.width, y: BOX.y }, { x: 0, y: -1 })).toEqual([
      BOX.height,
      0,
    ]);
  });

  it('is 0 both ways from a point outside', () => {
    expect(
      insideAlong(outline('fr-rect'), { x: BOX.x - 1, y: BOX.y + 30 }, { x: 0, y: 1 })
    ).toEqual([0, 0]);
    expect(
      insideAlong(outline('fr-rect'), { x: BOX.x + BOX.width + 1, y: BOX.y + 30 }, { x: 0, y: 1 })
    ).toEqual([0, 0]);
    expect(
      insideAlong(outline('rounded'), { x: BOX.x + 30, y: BOX.y - 1 }, { x: 1, y: 0 })
    ).toEqual([0, 0]);
  });
});
