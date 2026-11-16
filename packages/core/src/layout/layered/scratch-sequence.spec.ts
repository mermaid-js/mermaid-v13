// The layout takes its scratch arrays from a buffer it uses again and again (scratch.ts). Arrays
// left over from one layout must not change the next: here graphs of every kind are laid out one
// after another in one module instance, large after small and back, and each result is compared
// with the same graph laid out by fresh modules whose scratch arrays are all new ones.
import { describe, expect, it, vi } from 'vitest';
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { cellFixtures, randomGroupFixtures } from './grid.fixtures.ts';
import { handBuiltFixtures } from './layered.fixtures.ts';
import type * as Layered from './layered.ts';

type Engine = (graph: LayoutGraph) => LayoutModel;

// A layered DAG in nested groups, with labels and long edges: big enough to outgrow the buffer
// that the graphs before it left.
function grouped(size: number, seed: number): LayoutGraph {
  let s = seed;
  const rand = (): number => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const groups = Array.from({ length: Math.ceil(size / 25) }, (_, i) => ({
    id: `g${i}`,
    padding: { top: 8, right: 8, bottom: 8, left: 8 },
    title: { width: 60, height: 20 },
    ...(i > 0 && rand() < 0.5 ? { parent: `g${Math.floor(rand() * i)}` } : {}),
    ...(rand() < 0.2 ? { direction: 'LR' as const } : {}),
  }));
  const nodes = Array.from({ length: size }, (_, i) => ({
    id: `n${i}`,
    width: 40 + Math.floor(rand() * 80),
    height: 30 + Math.floor(rand() * 30),
    ...(rand() < 0.7 ? { parent: `g${Math.floor(rand() * groups.length)}` } : {}),
  }));
  const edges = [];
  for (let i = 1; i < size; i++) {
    for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) {
      const from = Math.floor(rand() * i);
      edges.push({
        id: `e${i}-${k}`,
        source: `n${from}`,
        target: `n${i}`,
        minLen: rand() < 0.1 ? 2 : 1,
        ...(rand() < 0.25 ? { label: { width: 30 + Math.floor(rand() * 40), height: 20 } } : {}),
      });
    }
  }
  return {
    direction: rand() < 0.5 ? 'TB' : 'LR',
    nodes,
    edges,
    groups,
    spacing: { node: 50, rank: 50, edge: 20 },
    headRoom: 8,
  };
}

const plain = (model: LayoutModel): unknown => ({
  ...model,
  nodes: [...model.nodes],
  edges: [...model.edges],
  groups: [...model.groups],
});
const clone = (graph: LayoutGraph): LayoutGraph => JSON.parse(JSON.stringify(graph)) as LayoutGraph;

// Fresh modules whose scratch arrays are always new: the layout as it was before the buffer.
async function unpooled(): Promise<Engine> {
  vi.resetModules();
  vi.doMock('./scratch.ts', () => ({
    i32: (n: number) => new Int32Array(n),
    f64: (n: number) => new Float64Array(n),
    u8: (n: number) => new Uint8Array(n),
    copy: (from: Int32Array, n = from.length) => from.slice(0, n),
    scratch: <T>(run: () => T): T => run(),
  }));
  const engine = (await import('./index.ts')).layered;
  vi.doUnmock('./scratch.ts');
  return engine;
}

async function fresh(): Promise<Engine> {
  vi.resetModules();
  return (await import('./index.ts')).layered;
}

const small = handBuiltFixtures().filter((f) => !f.name.startsWith('tree'));
const big = [
  ...handBuiltFixtures().filter((f) => f.name.startsWith('tree')),
  { name: 'grouped 120', graph: grouped(120, 1) },
  { name: 'grouped 300', graph: grouped(300, 2) },
];
const cells = [...cellFixtures().slice(0, 12), ...randomGroupFixtures(4)];

// Large then small, grouped and flat, curved, stepped and on the grid, each kind more than once.
const sequence = [
  ...big.flatMap((b, i) => [b, small[i % small.length]!, cells[i % cells.length]!]),
  ...small,
  ...[...big].reverse(),
  ...cells,
  ...big,
];

describe('layout scratch arrays across layouts', () => {
  it('lays out every graph of a mixed sequence as fresh modules with new arrays do', async () => {
    const reference = await unpooled();
    const expected = new Map(sequence.map((f) => [f, plain(reference(clone(f.graph)))]));
    const engine = await fresh();
    for (const f of sequence)
      expect(plain(engine(clone(f.graph))), f.name).toEqual(expected.get(f));
    // The same, backwards, in the same instance: what each layout follows has changed.
    for (const f of [...sequence].reverse())
      expect(plain(engine(clone(f.graph))), f.name).toEqual(expected.get(f));
  });

  it('lays out each graph as a fresh module instance does, after all the others', async () => {
    const engine = await fresh();
    for (const f of sequence) engine(clone(f.graph));
    for (const f of [...big, ...small.slice(0, 6), ...cells.slice(0, 4)]) {
      const after = plain(engine(clone(f.graph)));
      expect(after, f.name).toEqual(plain((await fresh())(clone(f.graph))));
    }
  });

  it('lays out correctly after a layout that throws mid-way', async () => {
    vi.resetModules();
    const L: typeof Layered = await import('./layered.ts');
    const S = await import('./scratch.ts');
    const graph = (): [Layered.LNode[], Layered.LEdge[]] => {
      const nodes = Array.from({ length: 40 }, (_, i) => L.lnode(30 + (i % 7) * 5, 20));
      const edges = Array.from({ length: 39 }, (_, i) => L.ledge(Math.floor(i / 2), i + 1));
      return [nodes, edges];
    };
    const opt = { nodeSep: 50, edgeSep: 20, rankSep: 50, portSep: 20 };
    const run = (): unknown => {
      const [nodes, edges] = graph();
      const size = L.layered(nodes, edges, opt);
      return { size, nodes, edges };
    };
    const before = run();
    // Leave the buffer full of other numbers, then throw once the layout has taken arrays.
    run();
    const [nodes, edges] = graph();
    Object.defineProperty(nodes[5]!, 'w', {
      get: () => {
        throw new Error('mid-way');
      },
    });
    expect(() => L.layered(nodes, edges, opt)).toThrow('mid-way');
    expect(S.scratchState()).toMatchObject({ top: 0, depth: 0 });
    expect(run()).toEqual(before);
  });
});
