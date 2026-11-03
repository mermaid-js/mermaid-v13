// Hand-built LayoutGraph fixtures in character cells (D77, D78, D140): what the flowchart builder
// makes with the compact cell profile. Node boxes are label + 4 wide and 3 high, edge label patches
// label + 2 wide and 1 high, group padding 1 with the title on the top border, `stepped` routing
// and `grid: 1`. They stand in for parser-built cell graphs until the builder takes the profile
// (#43). Test-only: excluded from the build.
import type { Dir, LayoutEdge, LayoutGraph, LayoutGroup, LayoutNode } from '../types.ts';
import { cellProfile } from '../units.ts';
import type { LayoutFixture } from './layered.fixtures.ts';

const profile = cellProfile();

function node(id: string, label = id, parent?: string): LayoutNode {
  return { id, width: [...label].length + 4, height: 3, ...(parent ? { parent } : {}) };
}

function edge(source: string, target: string, label?: string, minLen = 1): LayoutEdge {
  return {
    id: `${source}->${target}${label ? `:${label}` : ''}#${minLen}`,
    source,
    target,
    minLen,
    ...(label ? { label: { width: label.length + 2, height: 1 } } : {}),
  };
}

function group(id: string, parent?: string, direction?: Dir): LayoutGroup {
  return {
    id,
    padding: { top: 1, right: 1, bottom: 1, left: 1 },
    title: { width: id.length + 2, height: 0 },
    ...(parent ? { parent } : {}),
    ...(direction ? { direction } : {}),
  };
}

function graph(
  direction: Dir,
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  groups: LayoutGroup[] = []
): LayoutGraph {
  return {
    direction,
    nodes,
    edges,
    groups,
    spacing: { ...profile.builder.spacing },
    diagramPadding: 0,
    headRoom: profile.builder.headRoom,
    routing: 'stepped',
    metrics: profile.engine,
    grid: 1,
  };
}

const ids = (s: string): LayoutNode[] => s.split(' ').map((id) => node(id));

function tree(n: number, dir: Dir = 'TB'): LayoutGraph {
  const nodes = Array.from({ length: n }, (_, i) => node(`n${i}`, `Node ${i}`));
  const edges = Array.from({ length: n - 1 }, (_, k) => edge(`n${Math.floor(k / 3)}`, `n${k + 1}`));
  return graph(dir, nodes, edges);
}

const fan = (dir: Dir, out: boolean, names: string): LayoutGraph =>
  graph(
    dir,
    [node('A'), ...ids(names)],
    names.split(' ').map((t) => (out ? edge('A', t) : edge(t, 'A')))
  );

export function cellFixtures(): LayoutFixture[] {
  return [
    { name: 'single node', graph: graph('TB', ids('A'), []) },
    { name: 'chain TB', graph: graph('TB', ids('A B C'), [edge('A', 'B'), edge('B', 'C')]) },
    { name: 'chain BT', graph: graph('BT', ids('A B C'), [edge('A', 'B'), edge('B', 'C')]) },
    { name: 'chain LR', graph: graph('LR', ids('A B C'), [edge('A', 'B'), edge('B', 'C')]) },
    { name: 'chain RL', graph: graph('RL', ids('A B C'), [edge('A', 'B'), edge('B', 'C')]) },
    {
      name: 'odd and even widths in line',
      graph: graph(
        'TB',
        [node('A', 'odd'), node('B', 'even'), node('C', 'x')],
        [edge('A', 'B'), edge('B', 'C')]
      ),
    },
    {
      name: 'docs decision flow',
      graph: graph(
        'TB',
        [
          node('Start'),
          node('Q', 'Is it working?'),
          node('Ship', 'Ship it'),
          node('Debug'),
          node('Fix'),
          node('Celebrate'),
          node('Done'),
        ],
        [
          edge('Start', 'Q'),
          edge('Q', 'Ship', 'Yes'),
          edge('Q', 'Debug', 'No'),
          edge('Debug', 'Fix'),
          edge('Fix', 'Q'),
          edge('Ship', 'Celebrate'),
          edge('Celebrate', 'Done'),
        ]
      ),
    },
    {
      name: 'cycle',
      graph: graph('TB', ids('A B C D'), [
        edge('A', 'B'),
        edge('B', 'C'),
        edge('C', 'A'),
        edge('C', 'D'),
      ]),
    },
    {
      name: 'labelled LR with minLen',
      graph: graph('LR', ids('A B C D'), [
        edge('A', 'B', 'go'),
        edge('B', 'C', 'a longer label'),
        edge('A', 'D', undefined, 3),
        edge('C', 'D'),
      ]),
    },
    {
      name: 'parallel edges',
      graph: graph('TB', ids('A B'), [
        edge('A', 'B'),
        edge('A', 'B', 'again'),
        edge('B', 'A', 'back'),
      ]),
    },
    {
      name: 'self loops',
      graph: graph('TB', ids('A B'), [edge('A', 'A'), edge('A', 'B'), edge('B', 'B', 'retry')]),
    },
    {
      name: 'self loop LR',
      graph: graph('LR', ids('A B'), [edge('A', 'B'), edge('B', 'B', 'retry')]),
    },
    {
      name: 'self loop in a group',
      graph: graph(
        'TB',
        [node('A', 'A', 'g'), node('B', 'B1', 'g')],
        [edge('B', 'B')],
        [group('g')]
      ),
    },
    {
      name: 'K3,3',
      graph: graph(
        'TB',
        ids('a b c x y z'),
        ['a', 'b', 'c'].flatMap((s) => ['x', 'y', 'z'].map((t) => edge(s, t)))
      ),
    },
    { name: 'fan out TB five', graph: fan('TB', true, 'alpha beta gamma delta epsilon') },
    { name: 'fan in TB five', graph: fan('TB', false, 'alpha beta gamma delta epsilon') },
    { name: 'fan out LR four', graph: fan('LR', true, 'a1 a2 a3 a4') },
    { name: 'fan in RL four', graph: fan('RL', false, 'a1 a2 a3 a4') },
    { name: 'fan out BT three', graph: fan('BT', true, 'p q r') },
    {
      name: 'ampersands LR',
      graph: graph('LR', ids('A B C D'), [
        edge('A', 'C'),
        edge('A', 'D'),
        edge('B', 'C'),
        edge('B', 'D'),
      ]),
    },
    ...groupFixtures(),
  ];
}

function groupFixtures(): LayoutFixture[] {
  return [
    {
      name: 'disconnected parts',
      graph: graph('TB', ids('A B C D E'), [edge('A', 'B'), edge('C', 'D')]),
    },
    {
      name: 'subgraphs',
      graph: graph(
        'TB',
        [
          node('c1'),
          node('a1', 'a1', 'one'),
          node('a2', 'a2', 'one'),
          node('b1', 'b1', 'two'),
          node('b2', 'b2', 'two'),
        ],
        [
          edge('c1', 'a2'),
          edge('a1', 'a2'),
          edge('b1', 'b2'),
          edge('a2', 'b1'),
          edge('one', 'two'),
        ],
        [group('one'), group('two')]
      ),
    },
    {
      name: 'nested subgraphs with own direction',
      graph: graph(
        'TB',
        [
          node('top'),
          node('i1', 'i1', 'inner'),
          node('i2', 'i2', 'inner'),
          node('i3', 'i3', 'inner'),
          node('o1', 'o1', 'outer'),
          node('bottom'),
        ],
        [
          edge('i1', 'i2'),
          edge('i2', 'i3'),
          edge('top', 'o1'),
          edge('o1', 'bottom'),
          edge('outer', 'bottom'),
        ],
        [group('outer'), group('inner', 'outer', 'LR')]
      ),
    },
    {
      name: 'edge crossing into a directed group',
      graph: graph(
        'LR',
        [node('A'), node('B', 'B', 'g'), node('C', 'C', 'g'), node('D')],
        [edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('A', 'D', 'skip')],
        [group('g', undefined, 'TB')]
      ),
    },
    {
      name: 'group fan out RL',
      graph: graph(
        'RL',
        [node('s'), node('t1', 't1', 'g'), node('t2', 't2', 'g'), node('t3', 't3', 'g')],
        [edge('s', 't1'), edge('s', 't2'), edge('s', 't3')],
        [group('g')]
      ),
    },
    { name: 'empty group', graph: graph('TB', ids('A B'), [edge('A', 'B')], [group('nothing')]) },
    { name: 'tree 40', graph: tree(40) },
    { name: 'tree 40 LR', graph: tree(40, 'LR') },
  ];
}

// Seeded random graphs in every direction, with labels, parallel and back edges, and groups,
// for the grid properties over more shapes than the hand-built ones.
export function randomCellFixtures(count: number): LayoutFixture[] {
  let seed = 42;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const dirs: Dir[] = ['TB', 'LR', 'BT', 'RL'];
  const out: LayoutFixture[] = [];
  for (let k = 0; k < count; k++) {
    const dir = dirs[k % 4]!;
    const size = 3 + Math.floor(rand() * 9);
    const groups: LayoutGroup[] = rand() < 0.4 ? [group('g1')] : [];
    if (groups.length && rand() < 0.5) groups.push(group('g2', rand() < 0.5 ? 'g1' : undefined));
    const nodes = Array.from({ length: size }, (_, i) => {
      const label = 'n'.repeat(1 + Math.floor(rand() * 6)) + i;
      const parent = groups.length && rand() < 0.5 ? pick(groups).id : undefined;
      return node(`v${i}`, label, parent);
    });
    const edges: LayoutEdge[] = [];
    const seen = new Set<string>();
    const edgeCount = size - 1 + Math.floor(rand() * size);
    for (let j = 0; j < edgeCount; j++) {
      const a = Math.floor(rand() * size);
      let b = Math.floor(rand() * size);
      if (a === b) b = (b + 1) % size;
      const back = rand() < 0.15;
      const [s, t] = back ? [b, a] : [Math.min(a, b), Math.max(a, b)];
      const label = rand() < 0.25 ? pick(['yes', 'no', 'maybe later']) : undefined;
      const e = edge(`v${s}`, `v${t}`, label, rand() < 0.1 ? 2 : 1);
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      edges.push(e);
    }
    out.push({ name: `random ${k} ${dir}`, graph: graph(dir, nodes, edges, groups) });
  }
  return out;
}
