// The routes `compoundLayout` puts in the plane, pinned exactly: every point, port side, label and
// box of the layouts below, as the implementation that kept each level's routes in a map made them
// (7275feb8f). The routes are now made from each level's layout points as they are put in the
// plane (`routeInPlane`), so these pin that the points, their floating-point order and the
// 0.01 test that drops a repeated point are unchanged: in every direction, through nested ports,
// for edges between a group and its own member, on the grid, at sizes where neighbouring points
// fall either side of 0.01 (the layouts scaled down), and where a placement pass is laid out again
// and the first one restored.
import { describe, expect, it, vi } from 'vitest';
import type {
  Dir,
  LayoutEdge,
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  LayoutNode,
} from '../types.ts';
import { cellProfile } from '../units.ts';
import * as state from './compound-state.ts';
import { randomGroupFixtures } from './grid.fixtures.ts';
import { handBuiltFixtures } from './layered.fixtures.ts';
import { layered } from './index.ts';

vi.mock(import('./compound-state.ts'), async (original) => {
  const m = await original();
  return { ...m, restore: vi.fn(m.restore) };
});

const DIRS: Dir[] = ['TB', 'BT', 'LR', 'RL'];
const cells = cellProfile();

// Seeded graphs with up to four groups, nested at random and some in their own direction, edges
// between nodes and groups (labelled or not, some two ranks long), and edges between a group and
// its own member either way. In px the sizes carry fractions of `step`; on the grid (`grid`) they
// are whole cells.
function compoundGraphs(count: number, seed: number, step: number, grid: boolean): LayoutGraph[] {
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  const int = (n: number): number => Math.floor(rand() * n);
  const frac = (): number => (grid ? 0 : int(9) * step);
  const out: LayoutGraph[] = [];
  for (let k = 0; k < count; k++) {
    const direction = DIRS[k % 4]!;
    const groups: LayoutGroup[] = [];
    for (let j = 0, n = 1 + int(4); j < n; j++) {
      const p = grid ? 1 : 8 + frac();
      groups.push({
        id: `g${j}`,
        padding: { top: p + frac(), right: p, bottom: p + frac(), left: p },
        title: grid ? { width: 4, height: 0 } : { width: 40 + int(60) + frac(), height: 24 },
        ...(j > 0 && rand() < 0.7 ? { parent: `g${int(j)}` } : {}),
        ...(rand() < 0.3 ? { direction: DIRS[int(4)]! } : {}),
      });
    }
    const size = 3 + int(10);
    const nodes: LayoutNode[] = Array.from({ length: size }, (_, i) => ({
      id: `n${i}`,
      width: grid ? 3 + int(9) : 40 + int(80) + frac(),
      height: grid ? 3 : 30 + int(30) + frac(),
      ...(rand() < 0.75 ? { parent: `g${int(groups.length)}` } : {}),
    }));
    const all = [...nodes.map((n) => n.id), ...groups.map((g) => g.id)];
    const end = (): string => (rand() < 0.8 ? `n${int(size)}` : all[int(all.length)]!);
    const edges: LayoutEdge[] = [];
    for (let j = 0, n = 1 + int(size * 2); j < n; j++) {
      const label = grid
        ? { width: 2 + int(8), height: 1 }
        : { width: 30 + int(50) + frac(), height: 20 + frac() };
      const e = { id: `e${j}`, source: end(), target: end(), minLen: rand() < 0.15 ? 2 : 1 };
      edges.push(rand() < 0.3 ? { ...e, label } : e);
    }
    for (const n of nodes) {
      if (!n.parent || rand() >= 0.3) continue;
      const [source, target] = rand() < 0.5 ? [n.parent, n.id] : [n.id, n.parent];
      edges.push({ id: `own-${n.id}`, source, target, minLen: 1 });
    }
    const common = { direction, nodes, edges, groups };
    out.push(
      grid
        ? {
            ...common,
            spacing: { ...cells.builder.spacing },
            diagramPadding: 0,
            headRoom: cells.builder.headRoom,
            routing: 'stepped',
            metrics: cells.engine,
            grid: 1,
          }
        : {
            ...common,
            spacing: { node: 50 + frac(), rank: 50 + frac(), edge: 20 },
            diagramPadding: 8,
            headRoom: 8,
            ...(rand() < 0.3 ? { routing: 'stepped' as const } : {}),
          }
    );
  }
  return out;
}

// `g` with every length times `k`: small enough, neighbouring route points lie within hundredths
// of each other, some under the 0.01 that drops a repeated point and some over it.
function scaled(g: LayoutGraph, k: number): LayoutGraph {
  const box = <T extends { width: number; height: number }>(z: T): T => ({
    ...z,
    width: z.width * k,
    height: z.height * k,
  });
  return {
    ...g,
    nodes: g.nodes.map(box),
    edges: g.edges.map((e) => (e.label ? { ...e, label: box(e.label) } : e)),
    groups: g.groups.map((gr) => ({
      ...gr,
      padding: {
        top: gr.padding.top * k,
        right: gr.padding.right * k,
        bottom: gr.padding.bottom * k,
        left: gr.padding.left * k,
      },
      ...(gr.title ? { title: box(gr.title) } : {}),
    })),
    spacing: { node: g.spacing.node * k, rank: g.spacing.rank * k, edge: g.spacing.edge * k },
    diagramPadding: (g.diagramPadding ?? 0) * k,
    headRoom: (g.headRoom ?? 0) * k,
  };
}

// Groups `outer` ⊃ `mid` ⊃ `inner` in `dir`, with edges that cross one, two and three borders
// either way, between nested groups, to a group, and between a group and its own (nested) member.
function nested(dir: Dir, k = 1): LayoutGraph {
  const pad = { top: 8.004, right: 8, bottom: 8.006, left: 8 };
  const node = (id: string, parent?: string): LayoutNode => ({
    id,
    width: 60.013 + id.length,
    height: 40.007,
    ...(parent ? { parent } : {}),
  });
  const link = (source: string, target: string, label = false): LayoutEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    minLen: 1,
    ...(label ? { label: { width: 40.005, height: 20.003 } } : {}),
  });
  const g: LayoutGraph = {
    direction: dir,
    nodes: [
      node('a'),
      node('b', 'outer'),
      node('c', 'mid'),
      node('d', 'inner'),
      node('e', 'inner'),
      node('f'),
      node('h', 'side'),
    ],
    edges: [
      link('a', 'd'),
      link('d', 'f', true),
      link('a', 'b'),
      link('b', 'c'),
      link('c', 'e'),
      link('e', 'h'),
      link('h', 'mid'),
      link('outer', 'd'),
      link('e', 'mid'),
      link('inner', 'c'),
      link('side', 'a', true),
    ],
    groups: [
      { id: 'outer', padding: pad, title: { width: 50.002, height: 24 } },
      { id: 'mid', parent: 'outer', padding: pad, title: { width: 30, height: 24 } },
      { id: 'inner', parent: 'mid', padding: pad, title: { width: 30, height: 24 } },
      { id: 'side', padding: pad, direction: dir === 'TB' ? 'LR' : 'TB' },
    ],
    spacing: { node: 50, rank: 50.0049, edge: 20 },
    diagramPadding: 8,
    headRoom: 8,
  };
  return k === 1 ? g : scaled(g, k);
}

// Every number of the layout, exactly (JSON prints the shortest text that reads back the same).
const text = (m: LayoutModel): string =>
  JSON.stringify(m, (_, v: unknown) => (v instanceof Map ? [...v] : v));

// Two 32-bit FNV-1a hashes of `s`, as 16 hex digits.
function digest(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

const restore = vi.mocked(state.restore);

// Lays each graph out; per graph its digest and how many placement passes were restored.
function pinned(graphs: LayoutGraph[]): { lines: string[]; restored: number } {
  let restored = 0;
  const lines = graphs.map((g, i) => {
    restore.mockClear();
    const m = layered(g);
    const n = restore.mock.calls.length;
    restored += +(n > 0);
    return `${i} ${g.direction} ${digest(text(m))}${n ? ` restored ${n}` : ''}`;
  });
  return { lines, restored };
}

// `appendRoute` as it was before `appendPoint` was split out of it.
function appendRouteBefore(route: number[], part: number[], ox: number, oy: number): void {
  for (let i = 0; i < part.length; i += 3) {
    const x = part[i]! + ox;
    const y = part[i + 1]! + oy;
    const len = route.length;
    if (len >= 3 && Math.abs(route[len - 3]! - x) < 0.01 && Math.abs(route[len - 2]! - y) < 0.01)
      continue;
    route.push(x, y, part[i + 2]!);
  }
}

describe('appendPoint and appendRoute', () => {
  // Pieces whose points sit either side of 0.01 from the point before, also across the seam
  // between two pieces, with NaN, -0 and an offset that rounds.
  const pieces: [number[], number, number][] = [
    [[0, 0, 0, 0.0099, 0, 0, 0.01, 0, 1, 0.0199, 0.0099, 1], 0, 0],
    [[0.0299, 0.0099, 0, 0.03, 0.0199, 0, 0.0399, 0.0298, 1], 0.1, 0.2],
    [[-0.07, -0.18, 0, NaN, 0, 1, NaN, 0, 1, 0, NaN, 0, 0.005, 0.005, 1], 0.1, 0.2],
    [[-0, -0, 0, 0.004999, -0.004999, 1, 0.3, 0.1, 0], 0.1, 0.2],
    [[0.30999999, 0.10999999, 0, 0.32, 0.1, 1], 0.1 + 0.2, 0.3 - 0.1],
  ];

  it('drops the same points as before, by piece and point by point', () => {
    const before: number[] = [];
    const now: number[] = [];
    const single: number[] = [];
    for (const [part, ox, oy] of pieces) {
      appendRouteBefore(before, part, ox, oy);
      state.appendRoute(now, part, ox, oy);
      for (let i = 0; i < part.length; i += 3)
        state.appendPoint(single, part[i]! + ox, part[i + 1]! + oy, part[i + 2]!);
    }
    expect(now).toEqual(before);
    expect(single).toEqual(before);
    expect(before.length).toBeLessThan(pieces.reduce((n, [part]) => n + part.length, 0));
  });
});

describe('compoundLayout: routes in the plane', () => {
  it.each(DIRS)('nested ports and own-member edges, %s', (dir) => {
    expect(text(layered(nested(dir)))).toMatchSnapshot();
  });

  it('nested ports near the 0.01 tolerance', () => {
    expect(pinned(DIRS.map((dir) => nested(dir, 0.001))).lines).toMatchSnapshot();
  });

  it('seeded compound graphs in px', () => {
    const { lines, restored } = pinned(compoundGraphs(40, 13, 0.0049, false));
    expect(restored).toBeGreaterThan(0);
    expect(lines).toMatchSnapshot();
  });

  it('seeded compound graphs scaled down to the 0.01 tolerance', () => {
    const graphs = [
      ...compoundGraphs(20, 13, 0.0049, false).map((g) => scaled(g, 0.001)),
      ...compoundGraphs(20, 21, 0.0031, false).map((g) => scaled(g, 0.0005)),
    ];
    // Some neighbouring points that stay are under 0.02 apart.
    let close = 0;
    for (const g of graphs) {
      for (const e of layered(g).edges.values()) {
        for (let i = 1; i < e.points.length; i++) {
          const dx = Math.abs(e.points[i]!.x - e.points[i - 1]!.x);
          const dy = Math.abs(e.points[i]!.y - e.points[i - 1]!.y);
          if (Math.max(dx, dy) < 0.02) close++;
        }
      }
    }
    expect(close).toBeGreaterThan(0);
    expect(pinned(graphs).lines).toMatchSnapshot();
  });

  it('seeded compound graphs on the grid', () => {
    const { lines, restored } = pinned([
      ...compoundGraphs(24, 14, 0, true),
      ...randomGroupFixtures(40).map((f) => f.graph),
    ]);
    expect(restored).toBeGreaterThan(0);
    expect(lines).toMatchSnapshot();
  });

  it('the hand-built layered fixtures', () => {
    expect(pinned(handBuiltFixtures().map((f) => f.graph)).lines).toMatchSnapshot();
  });
});
