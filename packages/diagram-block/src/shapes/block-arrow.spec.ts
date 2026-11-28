// v12's `rendering-util/rendering-elements/shapes/blockArrow.spec.ts` (fa796a943), ported as is:
// the sixteen point sets, the axis shorthands and the natural width. Only the imports differ.
import { describe, expect, it } from 'vitest';
import { blockArrowSize, getArrowPoints, type ArrowDirection as Direction } from './block-arrow.ts';
import type { Point } from './outline.ts';

const bbox = { width: 100, height: 20 };
const node = { padding: 10 };
const width = 140;
const height = 40;
const midpoint = 20;
const padding = 5;

const p = (x: number, y: number): Point => ({ x, y });

const allDirectionsPoints = [
  p(0, 0),
  p(midpoint, 0),
  p(width / 2, 2 * padding),
  p(width - midpoint, 0),
  p(width, 0),
  p(width, -height / 3),
  p(width + 2 * padding, -height / 2),
  p(width, (-2 * height) / 3),
  p(width, -height),
  p(width - midpoint, -height),
  p(width / 2, -height - 2 * padding),
  p(midpoint, -height),
  p(0, -height),
  p(0, (-2 * height) / 3),
  p(-2 * padding, -height / 2),
  p(0, -height / 3),
];

const cases: { name: string; directions: Direction[]; points: Point[] }[] = [
  {
    name: 'four-way arrow',
    directions: ['right', 'left', 'up', 'down'],
    points: allDirectionsPoints,
  },
  {
    name: 'right-left-up arrow',
    directions: ['right', 'left', 'up'],
    points: [
      p(midpoint, 0),
      p(width - midpoint, 0),
      p(width, -height / 2),
      p(width - midpoint, -height),
      p(midpoint, -height),
      p(0, -height / 2),
    ],
  },
  {
    name: 'right-left-down arrow',
    directions: ['right', 'left', 'down'],
    points: [p(0, 0), p(midpoint, -height), p(width - midpoint, -height), p(width, 0)],
  },
  {
    name: 'right-up-down arrow',
    directions: ['right', 'up', 'down'],
    points: [p(0, 0), p(width, -midpoint), p(width, -height + midpoint), p(0, -height)],
  },
  {
    name: 'left-up-down arrow',
    directions: ['left', 'up', 'down'],
    points: [p(width, 0), p(0, -midpoint), p(0, -height + midpoint), p(width, -height)],
  },
  {
    name: 'horizontal arrow',
    directions: ['right', 'left'],
    points: [
      p(midpoint, 0),
      p(midpoint, -padding),
      p(width - midpoint, -padding),
      p(width - midpoint, 0),
      p(width, -height / 2),
      p(width - midpoint, -height),
      p(width - midpoint, -height + padding),
      p(midpoint, -height + padding),
      p(midpoint, -height),
      p(0, -height / 2),
    ],
  },
  {
    name: 'vertical arrow',
    directions: ['up', 'down'],
    points: [
      p(width / 2, 0),
      p(0, -padding),
      p(midpoint, -padding),
      p(midpoint, -height + padding),
      p(0, -height + padding),
      p(width / 2, -height),
      p(width, -height + padding),
      p(width - midpoint, -height + padding),
      p(width - midpoint, -padding),
      p(width, -padding),
    ],
  },
  {
    name: 'right-up angle',
    directions: ['right', 'up'],
    points: [p(0, 0), p(width, -midpoint), p(0, -height)],
  },
  {
    name: 'right-down angle',
    directions: ['right', 'down'],
    points: [p(0, 0), p(width, 0), p(0, -height)],
  },
  {
    name: 'left-up angle',
    directions: ['left', 'up'],
    points: [p(width, 0), p(0, -midpoint), p(width, -height)],
  },
  {
    name: 'left-down angle',
    directions: ['left', 'down'],
    points: [p(width, 0), p(0, 0), p(width, -height)],
  },
  {
    name: 'right arrow',
    directions: ['right'],
    points: [
      p(midpoint, -padding),
      p(midpoint, -padding),
      p(width - midpoint, -padding),
      p(width - midpoint, 0),
      p(width, -height / 2),
      p(width - midpoint, -height),
      p(width - midpoint, -height + padding),
      p(midpoint, -height + padding),
      p(midpoint, -height + padding),
    ],
  },
  {
    name: 'left arrow',
    directions: ['left'],
    points: [
      p(midpoint, 0),
      p(midpoint, -padding),
      p(width - midpoint, -padding),
      p(width - midpoint, -height + padding),
      p(midpoint, -height + padding),
      p(midpoint, -height),
      p(0, -height / 2),
    ],
  },
  {
    name: 'up arrow',
    directions: ['up'],
    points: [
      p(midpoint, -padding),
      p(midpoint, -height + padding),
      p(0, -height + padding),
      p(width / 2, -height),
      p(width, -height + padding),
      p(width - midpoint, -height + padding),
      p(width - midpoint, -padding),
    ],
  },
  {
    name: 'down arrow',
    directions: ['down'],
    points: [
      p(width / 2, 0),
      p(0, -padding),
      p(midpoint, -padding),
      p(midpoint, -height + padding),
      p(width - midpoint, -height + padding),
      p(width - midpoint, -padding),
      p(width, -padding),
    ],
  },
  {
    name: 'point fallback',
    directions: [],
    points: [p(0, 0)],
  },
];

describe('block arrow points', () => {
  for (const { name, directions, points } of cases) {
    it(`returns ${name} geometry`, () => {
      expect(getArrowPoints(directions, bbox, node, width)).toEqual(points);
    });
  }

  it('expands axis shorthands and deduplicates directions', () => {
    expect(getArrowPoints(['x', 'right', 'y', 'up'], bbox, node, width)).toEqual(
      allDirectionsPoints
    );
  });

  it('uses the natural width when total width is omitted', () => {
    expect(getArrowPoints(['right', 'down'], bbox, node)).toEqual([p(0, 0), p(150, 0), p(0, -40)]);
  });
});

// #1193: v12 sized a block arrow from its drawn polygon's bbox, so the size reserves what the
// polygon draws past its body. A label 100 by 20 with block padding 10 has a body
// 100 + 40 + 10 = 150 wide and 20 + 20 = 40 high.
describe('block arrow size', () => {
  const label = { width: 100, height: 20 };

  it('reserves the four-way arrowheads, 2 · 5 past the body on every side', () => {
    expect(blockArrowSize(label, 10, ['x', 'y'])).toEqual({ w: 170, h: 60 });
    expect(blockArrowSize(label, 10, ['right', 'left', 'up', 'down'])).toEqual({ w: 170, h: 60 });
  });

  it('is the body for every other set of directions, whose polygon fits inside it', () => {
    for (const directions of [
      ['right'],
      ['left'],
      ['up'],
      ['down'],
      ['x'],
      ['y'],
      ['right', 'up'],
      ['left', 'down'],
      ['x', 'up'],
      ['y', 'left'],
      [],
    ]) {
      expect(blockArrowSize(label, 10, directions)).toEqual({ w: 150, h: 40 });
    }
  });
});
