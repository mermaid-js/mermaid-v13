import { describe, expect, it } from 'vitest';
import { channelPath, type Budget, type Port, type Taken } from './channels.ts';
import { crosses } from './route.ts';
import { sidesOf, type Outline } from './shapes.ts';

/**
 * `channelPath` (#774), on its own: the C4 router's last search before a straight line. A three
 * by three grid of boxes 100 wide and 50 tall, 100 apart across and 50 down, as the corners and
 * the middle of a C4 diagram; the search runs from a1 (top left) to c3 (bottom right).
 */
const box = (col: number, row: number): Outline => ({
  x: col * 200,
  y: row * 100,
  width: 100,
  height: 50,
  form: 'rounded',
});
const GRID = [0, 1, 2].flatMap((row) => [0, 1, 2].map((col) => box(col, row)));
const A1 = GRID[0]!;
const C3 = GRID[8]!;
const NO_LINES: Taken = { upright: [], level: [] };

/** A budget of `n` units of work. */
const budget = (n = Infinity): Budget & { spent: number } => ({
  spent: 0,
  charge(k: number) {
    this.spent += k;
  },
  get done() {
    return this.spent >= n;
  },
});

/** The ports in the middle of each side of `b`. */
const ports = (b: Outline): Port[] => [
  { x: b.x, y: b.y + b.height / 2, dx: -1, dy: 0 },
  { x: b.x + b.width, y: b.y + b.height / 2, dx: 1, dy: 0 },
  { x: b.x + b.width / 2, y: b.y, dx: 0, dy: -1 },
  { x: b.x + b.width / 2, y: b.y + b.height, dx: 0, dy: 1 },
];

/** The stretches of a path, each as its two ends. */
const stretches = (p: readonly number[]): number[][] =>
  Array.from({ length: p.length / 2 - 1 }, (_, k) => p.slice(2 * k, 2 * k + 4));

describe('channelPath (#774)', () => {
  it('runs from a port of the start to a port of the end, through the gaps, clear of every other box', () => {
    const found = channelPath(
      { starts: ports(A1), ends: ports(C3), blocks: GRID, taken: NO_LINES },
      budget()
    );
    expect(found).toBeDefined();
    const { points, start, end } = found!;
    const [s, e] = [ports(A1)[start]!, ports(C3)[end]!];
    expect(points.slice(0, 2)).toEqual([s.x, s.y]);
    expect(points.slice(-2)).toEqual([e.x, e.y]);
    // Out of a1 the way the port faces, into c3 against the way its port faces.
    expect(Math.sign(points[2]! - points[0]!) || 0).toBe(s.dx);
    expect(Math.sign(points[3]! - points[1]!) || 0).toBe(s.dy);
    const n = points.length;
    expect(Math.sign(points[n - 4]! - points[n - 2]!) || 0).toBe(e.dx);
    expect(Math.sign(points[n - 3]! - points[n - 1]!) || 0).toBe(e.dy);
    for (const [x0, y0, x1, y1] of stretches(points)) expect(x0 === x1 || y0 === y1).toBe(true);
    for (const o of GRID.slice(1, 8)) expect(crosses(points, sidesOf(o))).toBe(false);
    // The fewest bends there are (three), and never away from c3: as long as the ports are apart.
    expect(n / 2 - 2).toBe(3);
    const length = stretches(points).reduce(
      (sum, [x0, y0, x1, y1]) => sum + Math.abs(x1! - x0!) + Math.abs(y1! - y0!),
      0
    );
    expect(length).toBe(Math.abs(e.x - s.x) + Math.abs(e.y - s.y));
  });

  it('runs down the middle of a gap', () => {
    const { points } = channelPath(
      { starts: [ports(A1)[1]!], ends: [ports(C3)[2]!], blocks: GRID, taken: NO_LINES },
      budget()
    )!;
    // Right out of a1, down the gap between the first two columns, along the gap above c3's row.
    expect(points).toEqual([100, 25, 150, 25, 150, 175, 450, 175, 450, 200]);
  });

  it('crosses fewer lines already routed, where two ways are as long', () => {
    // The way above is taken: a line runs down the gap between the first two columns.
    const taken: Taken = { upright: [150, -100, 400], level: [] };
    const { points } = channelPath(
      { starts: ports(A1), ends: ports(C3), blocks: GRID, taken },
      budget()
    )!;
    expect(points.some((v, k) => k % 2 === 0 && v === 150)).toBe(false);
    for (const o of GRID.slice(1, 8)) expect(crosses(points, sidesOf(o))).toBe(false);
  });

  it('finds none to a box walled in', () => {
    const wall = (x: number, y: number, width: number, height: number): Outline => ({
      x,
      y,
      width,
      height,
      form: 'rounded',
    });
    // c3 with a box against each side, the corners filled.
    const walls = [
      wall(C3.x - 50, C3.y - 50, 200, 50),
      wall(C3.x - 50, C3.y + 50, 200, 50),
      wall(C3.x - 50, C3.y, 50, 50),
      wall(C3.x + 100, C3.y, 50, 50),
    ];
    const work = budget();
    expect(
      channelPath(
        { starts: ports(A1), ends: ports(C3), blocks: [A1, C3, ...walls], taken: NO_LINES },
        work
      )
    ).toBeUndefined();
    expect(work.done).toBe(false);
  });

  it('stops when the work budget is spent, before building a grid larger than what is left', () => {
    const ground = { starts: ports(A1), ends: ports(C3), blocks: GRID, taken: NO_LINES };
    const full = budget();
    channelPath(ground, full);
    expect(full.spent).toBeGreaterThan(0);
    for (const left of [0, 1, full.spent - 1]) {
      const work = budget(left);
      expect(channelPath(ground, work)).toBeUndefined();
      expect(work.done).toBe(true);
    }
    expect(channelPath(ground, budget(full.spent + 1))).toBeDefined();
  });
});
