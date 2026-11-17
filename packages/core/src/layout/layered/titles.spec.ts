import { describe, expect, it } from 'vitest';
import type { LayoutGraph, LayoutModel, RoutePoint } from '../types.ts';
import { pxProfile } from '../units.ts';
import { clearTitles } from './titles.ts';

// One group 200 wide (x 0..200, padding 20), its title 40 x 10 centred at (100, 15), and routes
// given as points. The px profile keeps routes `endLabelAcross` (6) clear of a title.
const GAP = pxProfile.engine.endLabelAcross;
const PAD = 20;
const TITLE = { width: 40, height: 10 };

function graphWith(edges: number, title: typeof TITLE | null = TITLE): LayoutGraph {
  return {
    direction: 'TB',
    nodes: [],
    edges: Array.from({ length: edges }, (_, i) => ({
      id: `e${i}`,
      source: 'a',
      target: 'b',
      minLen: 1,
    })),
    groups: [
      {
        id: 'g',
        padding: { top: 16, right: PAD, bottom: PAD, left: PAD },
        ...(title ? { title } : {}),
      },
    ],
    spacing: { node: 50, rank: 50, edge: 20 },
  };
}

function modelWith(...routes: [number, number][][]): LayoutModel {
  const point = ([x, y]: [number, number]): RoutePoint => ({ x, y, axis: 'v' });
  return {
    width: 200,
    height: 100,
    direction: 'TB',
    nodes: new Map(),
    groups: new Map([['g', { x: 100, y: 50, width: 200, height: 100, title: { x: 100, y: 15 } }]]),
    edges: new Map(
      routes.map((r, i) => [
        `e${i}`,
        { points: r.map(point), ports: { source: 'bottom', target: 'top' } },
      ])
    ),
  };
}

const titleX = (routes: [number, number][][], title: typeof TITLE | null = TITLE): number => {
  const model = modelWith(...routes);
  return clearTitles(graphWith(routes.length, title), model).groups.get('g')!.title.x;
};

describe('clearTitles (#675)', () => {
  it('keeps a title no route comes near, and returns the model it was given', () => {
    const model = modelWith([
      [30, -20],
      [30, 60],
    ]);
    expect(clearTitles(graphWith(1), model)).toBe(model);
    expect(model.groups.get('g')!.title).toEqual({ x: 100, y: 15 });
  });

  it('keeps a title whose side is exactly the gap from a route', () => {
    expect(
      titleX([
        [
          [120 + GAP, -20],
          [120 + GAP, 60],
        ],
      ])
    ).toBe(100);
  });

  it('moves a title off a vertical route through it, to the nearer side, the left on a tie', () => {
    expect(
      titleX([
        [
          [100, -20],
          [100, 60],
        ],
      ])
    ).toBe(100 - GAP - 20);
    expect(
      titleX([
        [
          [95, -20],
          [95, 60],
        ],
      ])
    ).toBe(95 + GAP + 20);
    expect(
      titleX([
        [
          [105, -20],
          [105, 60],
        ],
      ])
    ).toBe(105 - GAP - 20);
  });

  it('moves a title off a route closer than the gap', () => {
    expect(
      titleX([
        [
          [120 + GAP - 1, -20],
          [120 + GAP - 1, 60],
        ],
      ])
    ).toBe(120 + GAP - 1 - GAP - 20);
  });

  it('sees a route that only runs within the band, or across it', () => {
    expect(
      titleX([
        [
          [100, 12],
          [100, 18],
        ],
      ])
    ).toBe(100 - GAP - 20);
    // A level run 60..90 in the band: its span is 34..116, and 34 is past the padding.
    expect(
      titleX([
        [
          [60, 15],
          [90, 15],
        ],
      ])
    ).toBe(116);
    // Drawn right to left, 140..100: its span is 74..166 whichever end comes first.
    expect(
      titleX([
        [
          [140, 15],
          [100, 15],
        ],
      ])
    ).toBe(74);
  });

  it('ignores routes above or below the band, and ones that only touch it', () => {
    expect(
      titleX([
        [
          [100, -20],
          [100, 10],
        ],
      ])
    ).toBe(100);
    expect(
      titleX([
        [
          [100, 20],
          [100, 60],
        ],
      ])
    ).toBe(100);
  });

  it('takes the nearest place clear of every route', () => {
    // Routes at 100 and 66: left of 66 is 66 - 26 = 40, right of 100 is 126; 126 is nearer.
    expect(
      titleX([
        [
          [100, -20],
          [100, 60],
        ],
        [
          [66, -20],
          [66, 60],
        ],
      ])
    ).toBe(126);
  });

  it('stays inside the group padding, and stays put with no place there', () => {
    // Centres may go 60 either way (100 - 20 padding - 20 half title). Routes at 66, 100 and 140
    // leave one place, 40, exactly at that limit.
    const at = (x: number): [number, number][] => [
      [x, -20],
      [x, 60],
    ];
    expect(titleX([at(66), at(100), at(140)])).toBe(40);
    // Routes at 64, 100 and 136 leave places only at 38 and 162, inside the padding: it stays.
    expect(titleX([at(64), at(100), at(136)])).toBe(100);
    // A title as wide as the room inside the padding cannot move either.
    expect(
      titleX(
        [
          [
            [100, -20],
            [100, 60],
          ],
        ],
        { width: 160, height: 10 }
      )
    ).toBe(100);
  });

  it('skips a group without a title', () => {
    expect(
      titleX(
        [
          [
            [100, -20],
            [100, 60],
          ],
        ],
        null
      )
    ).toBe(100);
  });
});
