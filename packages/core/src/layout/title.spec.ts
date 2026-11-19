import { describe, expect, it } from 'vitest';
import { compass } from './compass/index.ts';
import { layered } from './layered/index.ts';
import { titlePoint } from './title.ts';
import { tree } from './tree/index.ts';
import type {
  LayoutEngine,
  LayoutGraph,
  LayoutGroup,
  LayoutModel,
  TitlePosition,
} from './types.ts';
import { validateLayout } from './validate.ts';

// `LayoutGroup.titlePosition` (mermaid-js/mermaid#2977): the title's place in its group, in
// every engine that honours it.
const POSITIONS: TitlePosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const TITLE = { width: 60, height: 20 };

/** Two nodes in a group `g` and an edge between them; the title's room is on its own side. */
function graph(titlePosition?: TitlePosition): LayoutGraph {
  const low = titlePosition?.startsWith('bottom');
  const group: LayoutGroup = {
    id: 'g',
    padding: { top: low ? 20 : 30, right: 20, bottom: low ? 30 : 20, left: 20 },
    title: TITLE,
  };
  if (titlePosition) group.titlePosition = titlePosition;
  return {
    direction: 'TB',
    nodes: [
      { id: 'a', width: 200, height: 40, parent: 'g' },
      { id: 'b', width: 200, height: 40, parent: 'g' },
    ],
    edges: [{ id: 'e', source: 'a', target: 'b', minLen: 1 }],
    groups: [group],
    spacing: { node: 40, rank: 40, edge: 10 },
  };
}

/** The title's box, and the frame and the nodes it must stay inside and clear of. */
function boxes(model: LayoutModel) {
  const g = model.groups.get('g')!;
  const title = {
    x0: g.title.x - TITLE.width / 2,
    x1: g.title.x + TITLE.width / 2,
    y0: g.title.y - TITLE.height / 2,
    y1: g.title.y + TITLE.height / 2,
  };
  const frame = {
    x0: g.x - g.width / 2,
    x1: g.x + g.width / 2,
    y0: g.y - g.height / 2,
    y1: g.y + g.height / 2,
  };
  const nodes = [...model.nodes.values()].map((n) => ({
    y0: n.y - n.height / 2,
    y1: n.y + n.height / 2,
  }));
  return { g, title, frame, nodes };
}

const ENGINES: [string, LayoutEngine][] = [
  ['layered', layered],
  ['tree', tree],
  ['compass', compass],
];

describe.each(ENGINES)('group title position in %s', (_, engine) => {
  it.each(POSITIONS)('puts the title %s, inside the frame and clear of the nodes', (position) => {
    const input = graph(position);
    const model = engine(input);
    expect(validateLayout(input, model)).toEqual([]);
    const { g, title, frame, nodes } = boxes(model);
    expect(title.x0).toBeGreaterThanOrEqual(frame.x0);
    expect(title.x1).toBeLessThanOrEqual(frame.x1);
    expect(title.y0).toBeGreaterThanOrEqual(frame.y0);
    expect(title.y1).toBeLessThanOrEqual(frame.y1);
    if (position.startsWith('top'))
      for (const n of nodes) expect(title.y1).toBeLessThanOrEqual(n.y0);
    else for (const n of nodes) expect(title.y0).toBeGreaterThanOrEqual(n.y1);
    if (position.endsWith('left')) expect(g.title.x).toBeLessThan(g.x);
    else if (position.endsWith('right')) expect(g.title.x).toBeGreaterThan(g.x);
    else expect(g.title.x).toBeCloseTo(g.x, 6);
  });

  it('gives a group the same size with its title at the top or the bottom', () => {
    const top = engine(graph('top-center')).groups.get('g')!;
    const low = engine(graph('bottom-center')).groups.get('g')!;
    expect(low.width).toBeCloseTo(top.width, 6);
    expect(low.height).toBeCloseTo(top.height, 6);
  });
});

describe('group title position', () => {
  it('leaves layered and tree as they were for top-center', () => {
    expect(layered(graph('top-center'))).toEqual(layered(graph()));
    expect(tree(graph('top-center'))).toEqual(tree(graph()));
  });

  it('keeps the compass title at the top left when no position is set', () => {
    expect(compass(graph('top-left'))).toEqual(compass(graph()));
  });

  it('places a title from its frame, its drop and its inset', () => {
    const g = (titlePosition?: TitlePosition): LayoutGroup => ({
      ...graph(titlePosition).groups[0]!,
    });
    const frame = [100, 50, 300, 250] as const;
    expect(titlePoint(g(), frame, 15, 8)).toEqual({ x: 200, y: 65 });
    expect(titlePoint(g('top-left'), frame, 15, 8)).toEqual({ x: 138, y: 65 });
    expect(titlePoint(g('bottom-right'), frame, 15, 8)).toEqual({ x: 262, y: 235 });
    expect(titlePoint(g('bottom-center'), frame, 15, 8)).toEqual({ x: 200, y: 235 });
  });
});
