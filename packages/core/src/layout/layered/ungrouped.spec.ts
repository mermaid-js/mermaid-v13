import { describe, expect, it } from 'vitest';
import type { Dir, EdgeRouting, LayoutGraph, LayoutModel, LayoutNode } from '../types.ts';
import { cellProfile } from '../units.ts';
import { cellFixtures, randomCellFixtures, reviewFixtures } from './grid.fixtures.ts';
import { layered } from './index.ts';
import { handBuiltFixtures } from './layered.fixtures.ts';

// A graph without groups takes a shorter way through the compound layout (#278). These record,
// as laid out before that change, every fixture without groups and one graph built to reach each
// branch of the compound layout's root level: both flipped directions, every routing, the grid,
// self-loops with and without labels, edge labels, end labels and markers, a cycle, parallel
// edges, a parent that names a node rather than a group, and tight and turned layouts.

// The model as text, every number exact (the shortest form that reads back the same, and -0 kept).
function exact(model: LayoutModel): string {
  const num = (v: number): string => (Object.is(v, -0) ? '-0' : String(v));
  const at = (p: { x: number; y: number } | undefined): string =>
    p ? `${num(p.x)},${num(p.y)}` : '-';
  const lines = [`${model.direction} ${num(model.width)} x ${num(model.height)}`];
  for (const [id, n] of model.nodes)
    lines.push(`node ${id} ${at(n)} ${num(n.width)} x ${num(n.height)}`);
  for (const [id, g] of model.groups)
    lines.push(`group ${id} ${at(g)} ${num(g.width)} x ${num(g.height)} title ${at(g.title)}`);
  for (const [id, e] of model.edges) {
    const points = e.points.map((p) => `${at(p)}${p.axis}`).join(' ');
    const labels = `label ${at(e.label)} start ${at(e.startLabel)} end ${at(e.endLabel)}`;
    lines.push(`edge ${id} ${e.ports.source}-${e.ports.target} ${labels} | ${points}`);
  }
  return lines.join('\n');
}

// FNV-1a over the text: a fixture's whole layout in eight hex digits.
function digest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const px = (id: string, width: number, parent?: string): LayoutNode => ({
  id,
  width,
  height: 54,
  ...(parent ? { parent } : {}),
});

function branches(direction: Dir, routing: EdgeRouting, extra: Partial<LayoutGraph> = {}) {
  const graph: LayoutGraph = {
    direction,
    nodes: [px('A', 60), px('B', 120), px('C', 84), px('D', 60), px('E', 99, 'A'), px('F', 60)],
    edges: [
      { id: 'ab', source: 'A', target: 'B', minLen: 1, label: { width: 66, height: 28 } },
      { id: 'ab2', source: 'A', target: 'B', minLen: 1 },
      { id: 'bc', source: 'B', target: 'C', minLen: 2 },
      { id: 'ca', source: 'C', target: 'A', minLen: 1, label: { width: 30, height: 28 } },
      { id: 'bb', source: 'B', target: 'B', minLen: 1, label: { width: 48, height: 28 } },
      { id: 'dd', source: 'D', target: 'D', minLen: 1 },
      {
        id: 'cd',
        source: 'C',
        target: 'D',
        minLen: 1,
        startLabel: { width: 20, height: 18 },
        endLabel: { width: 34, height: 18 },
        startMarker: { length: 12, width: 12 },
        endMarker: { length: 10, width: 10 },
      },
      { id: 'de', source: 'D', target: 'E', minLen: 1 },
      { id: 'af', source: 'A', target: 'F', minLen: 1 },
      { id: 'ef', source: 'E', target: 'F', minLen: 1, endLabel: { width: 16, height: 18 } },
    ],
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
    headRoom: 8,
    routing,
    ...extra,
  };
  return graph;
}

const cells = cellProfile();
const onGrid = (direction: Dir): LayoutGraph => {
  const g = branches(direction, 'stepped');
  return {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, width: Math.round(n.width / 9), height: 3 })),
    edges: g.edges.map((e) => {
      const cell = (s?: { width: number; height: number }) =>
        s && { width: Math.round(s.width / 9) + 2, height: 1 };
      const { label, startLabel, endLabel, startMarker, endMarker, ...rest } = e;
      void startMarker;
      void endMarker;
      return {
        ...rest,
        ...(label ? { label: cell(label) } : {}),
        ...(startLabel ? { startLabel: cell(startLabel) } : {}),
        ...(endLabel ? { endLabel: cell(endLabel) } : {}),
      };
    }),
    spacing: { ...cells.builder.spacing },
    diagramPadding: 0,
    headRoom: cells.builder.headRoom,
    metrics: cells.engine,
    grid: 1,
  };
};

const DIRS: Dir[] = ['TB', 'BT', 'LR', 'RL'];
const ROUTINGS: EdgeRouting[] = ['curved', 'stepped', 'straight'];

const built: [string, LayoutGraph][] = [
  ...DIRS.flatMap((d) =>
    ROUTINGS.map((r) => [`${d} ${r}`, branches(d, r)] as [string, LayoutGraph])
  ),
  ...DIRS.map((d) => [`${d} on the grid`, onGrid(d)] as [string, LayoutGraph]),
  ['LR tight', branches('LR', 'curved', { availableWidth: 900 })],
  ['LR turned', branches('LR', 'curved', { availableWidth: 300 })],
  ['TB tight', branches('TB', 'stepped', { availableWidth: 200 })],
];

const fixtures: [string, LayoutGraph][] = [
  ...handBuiltFixtures(),
  ...cellFixtures(),
  ...reviewFixtures(),
  ...randomCellFixtures(40),
]
  .filter((f) => f.graph.groups.length === 0)
  .map((f) => [f.name, f.graph]);

describe('layered: graphs without groups', () => {
  it.each(built)('lays out the branch graph %s as before', (_, graph) => {
    expect(exact(layered(graph))).toMatchSnapshot();
  });

  it('lays out every fixture without groups as before', () => {
    const digests = fixtures.map(([name, graph]) => `${digest(exact(layered(graph)))} ${name}`);
    expect(digests.join('\n')).toMatchSnapshot();
  });
});
