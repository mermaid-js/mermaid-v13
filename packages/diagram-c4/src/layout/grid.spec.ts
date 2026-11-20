import { describe, expect, it } from 'vitest';
import type { C4Direction } from '../model.ts';
import { placeGrid, type GridGroup, type GridNode, type GridSpacing } from './grid.ts';

/**
 * The grid's fill order (#730, amending D452) on `placeGrid` itself: square boxes and the same gap
 * on both axes, so what LR does is TB's with x and y swapped, and BT and RL are TB and LR
 * mirrored across the lines.
 */
const SIDE = 10;
const GAP = 4;
const PER_LINE = 3;

const spacing = (over: Partial<GridSpacing> = {}): GridSpacing => ({
  shapeGapX: GAP,
  shapeGapY: GAP,
  groupGapX: GAP,
  groupGapY: GAP,
  pad: 0,
  nextLinePaddingX: 0,
  headPadX: 0,
  shapeInRow: PER_LINE,
  boundaryInRow: PER_LINE,
  ...over,
});

const node = (index: number): GridNode => ({ index, x: 0, y: 0, w: SIDE, h: SIDE });

const group = (nodes: number, kids: number, direction?: C4Direction): GridGroup => ({
  index: -1,
  parent: -1,
  depth: -1,
  kids: Array.from({ length: kids }, (_, i) => ({
    ...group(0, 0),
    index: i,
    w: SIDE,
    h: SIDE,
  })),
  nodes: Array.from({ length: nodes }, (_, i) => node(i)),
  head: 0,
  headW: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  ...(direction ? { direction } : {}),
});

/** Places a top level of `nodes` elements and `kids` boundaries; the boxes and the size. */
function place(
  direction: C4Direction | undefined,
  nodes: number,
  kids = 0,
  over: Partial<GridSpacing> = {}
) {
  const top = group(nodes, kids, direction);
  placeGrid([top], spacing(over), () => undefined);
  const at = (boxes: { x: number; y: number }[]): [number, number][] =>
    boxes.map(({ x, y }) => [x, y]);
  return { nodes: at(top.nodes), kids: at(top.kids), w: top.w, h: top.h };
}

const STEP = SIDE + GAP;
const SPAN = 3 * SIDE + 2 * GAP;

describe('the grid fill order (#730)', () => {
  it('lays TB out as rows: members left to right, lines down', () => {
    const { nodes, w, h } = place('TB', 6);
    expect(nodes).toEqual([
      [0, 0],
      [STEP, 0],
      [2 * STEP, 0],
      [0, STEP],
      [STEP, STEP],
      [2 * STEP, STEP],
    ]);
    expect([w, h]).toEqual([SPAN, 2 * SIDE + GAP]);
  });

  it('is the same as no direction', () => {
    expect(place(undefined, 8, 2)).toEqual(place('TB', 8, 2));
  });

  it('lays LR out as TB with x and y swapped: rows become columns', () => {
    const tb = place('TB', 8, 2);
    const lr = place('LR', 8, 2);
    expect(lr.nodes.length).toBe(8);
    // Elements and boundaries each, along their own lines.
    expect(lr.nodes.slice(0, 6)).toEqual(tb.nodes.slice(0, 6).map(([x, y]) => [y, x]));
    // The first column holds the first three members, top to bottom.
    expect(lr.nodes.slice(0, 3)).toEqual([
      [0, 0],
      [0, STEP],
      [0, 2 * STEP],
    ]);
    expect([lr.w, lr.h]).toEqual([tb.h, tb.w]);
  });

  it('puts the boundaries below the elements in TB and right of them in LR', () => {
    const tb = place('TB', 3, 2);
    const lr = place('LR', 3, 2);
    // Three elements are one row (TB) or one column (LR); the boundaries follow the gap after it.
    expect(tb.kids).toEqual([
      [0, SIDE + GAP],
      [STEP, SIDE + GAP],
    ]);
    expect(lr.kids).toEqual([
      [SIDE + GAP, 0],
      [SIDE + GAP, STEP],
    ]);
    expect(tb.nodes).toEqual([
      [0, 0],
      [STEP, 0],
      [2 * STEP, 0],
    ]);
    expect(lr.nodes).toEqual([
      [0, 0],
      [0, STEP],
      [0, 2 * STEP],
    ]);
  });

  it('mirrors the lines for BT and RL, so the first statement comes last', () => {
    const tb = place('TB', 6);
    const bt = place('BT', 6);
    // Same rows, members still left to right, the first row at the bottom.
    expect(bt.nodes).toEqual(tb.nodes.map(([x, y]) => [x, tb.h - y - SIDE]));
    expect(bt.nodes[0]).toEqual([0, SIDE + GAP]);
    expect(bt.nodes[3]).toEqual([0, 0]);
    const lr = place('LR', 6);
    const rl = place('RL', 6);
    expect(rl.nodes).toEqual(lr.nodes.map(([x, y]) => [lr.w - x - SIDE, y]));
    expect(rl.nodes[0]).toEqual([SIDE + GAP, 0]);
    expect(rl.nodes[3]).toEqual([0, 0]);
  });

  it('puts the boundaries above the elements in BT and left of them in RL', () => {
    expect(place('BT', 3, 2).kids).toEqual([
      [0, 0],
      [STEP, 0],
    ]);
    expect(place('BT', 3, 2).nodes[0]).toEqual([0, SIDE + GAP]);
    expect(place('RL', 3, 2).kids).toEqual([
      [0, 0],
      [0, STEP],
    ]);
    expect(place('RL', 3, 2).nodes[0]).toEqual([SIDE + GAP, 0]);
  });

  it('keeps each gap on its physical axis: X gaps run along x, Y gaps along y', () => {
    const over = { shapeGapX: 7, shapeGapY: 21, groupGapX: 5, groupGapY: 9 };
    const tb = place('TB', 4, 1, { ...over, shapeInRow: 2 });
    expect(tb.nodes).toEqual([
      [0, 0],
      [SIDE + 7, 0],
      [0, SIDE + 21],
      [SIDE + 7, SIDE + 21],
    ]);
    // The boundary is below the elements, a Y gap of the groups' away.
    expect(tb.kids).toEqual([[0, 2 * SIDE + 21 + 9]]);
    const lr = place('LR', 4, 1, { ...over, shapeInRow: 2 });
    // Members of a column are a Y gap apart, the columns an X gap.
    expect(lr.nodes).toEqual([
      [0, 0],
      [0, SIDE + 21],
      [SIDE + 7, 0],
      [SIDE + 7, SIDE + 21],
    ]);
    // The boundary is right of the elements, an X gap of the groups' away.
    expect(lr.kids).toEqual([[2 * SIDE + 7 + 5, 0]]);
  });

  it("moves the lines after the first by nextLinePaddingX along the members' axis", () => {
    const over = { nextLinePaddingX: 6, shapeInRow: 1 };
    expect(place('TB', 2, 0, over).nodes).toEqual([
      [0, 0],
      [6, SIDE + GAP],
    ]);
    expect(place('LR', 2, 0, over).nodes).toEqual([
      [0, 0],
      [SIDE + GAP, 6],
    ]);
  });

  it('moves the first line right instead for a negative nextLinePaddingX, so none starts left of 0', () => {
    expect(place('TB', 2, 0, { nextLinePaddingX: -6, shapeInRow: 1 }).nodes).toEqual([
      [6, 0],
      [0, SIDE + GAP],
    ]);
  });
});

/**
 * A row holding a shape whose ports are only part of its box (a person's body, D679) lines up
 * its members' port middles; the gap after a member is its own `gapAfter` where that is wider.
 */
describe('the grid lines a row up on its ports, and widens a gap for labels (D679)', () => {
  /** A tall member whose port middle lies `PORT` below its top, below its own middle. */
  const TALL = 3 * SIDE;
  const PORT = 2 * SIDE;
  const withPerson = (direction?: C4Direction): GridGroup => {
    const top = group(3, 0, direction);
    top.nodes[1] = { index: 1, x: 0, y: 0, w: SIDE, h: TALL, portMiddle: PORT };
    return top;
  };
  const middles = (top: GridGroup): number[] =>
    top.nodes.map((n) => n.y + (n.portMiddle ?? n.h / 2));

  it('puts the middle of every member level with the port middle of the person', () => {
    const top = withPerson();
    placeGrid([top], spacing(), () => undefined);
    expect(middles(top)).toEqual([PORT, PORT, PORT]);
    // The person's head is the row's top; the others hang lower.
    expect(top.nodes.map((n) => n.y)).toEqual([PORT - SIDE / 2, 0, PORT - SIDE / 2]);
    expect(top.h).toBe(TALL);
  });

  it('keeps the port middles level in BT, where the rows are reversed', () => {
    const top = withPerson('BT');
    top.nodes.push(node(3));
    placeGrid([top], spacing(), () => undefined);
    const firstRow = middles(top).slice(0, 3);
    expect(new Set(firstRow).size).toBe(1);
    // The first row comes last: below the second.
    expect(top.nodes[0]!.y).toBeGreaterThan(top.nodes[3]!.y);
  });

  it('keeps the tops level in a row without such a member', () => {
    const top = group(3, 0);
    top.nodes[1] = { index: 1, x: 0, y: 0, w: SIDE, h: TALL };
    placeGrid([top], spacing(), () => undefined);
    expect(top.nodes.map((n) => n.y)).toEqual([0, 0, 0]);
  });

  it('widens the gap after a member to its gapAfter, never narrows it', () => {
    const wide = 5 * GAP;
    const top = group(3, 0);
    top.nodes[0]!.gapAfter = wide;
    top.nodes[1]!.gapAfter = GAP / 2;
    placeGrid([top], spacing(), () => undefined);
    expect(top.nodes.map((n) => n.x)).toEqual([0, SIDE + wide, 2 * SIDE + wide + GAP]);
    expect(top.w).toBe(3 * SIDE + wide + GAP);
  });

  it('does not carry a gap past the end of a row', () => {
    const top = group(4, 0);
    top.nodes[2]!.gapAfter = 5 * GAP;
    placeGrid([top], spacing(), () => undefined);
    expect(top.nodes[3]!.x).toBe(0);
    expect(top.w).toBe(SPAN);
  });
});
