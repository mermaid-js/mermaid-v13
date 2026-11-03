import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layered, pxProfile, type LayoutGraph, type LayoutMetrics } from '@mermaid-js/core/layout';
import { REPO_ROOT } from './index.ts';

// The px profile must not change one SVG byte (D77). Since #42 the `layered` engine reads every
// length from `LayoutGraph.metrics`, defaulting to `pxProfile.engine`; the corpus SVG was diffed
// byte for byte against the pre-change output when the constants moved. These checks keep it so:
// no length constant comes back into the engine source, and the metrics really are read.
const LAYERED = join(REPO_ROOT, 'packages/core/src/layout/layered');
const source = (file: string): string => readFileSync(join(LAYERED, file), 'utf8');

const MOVED = [
  'PORT_PITCH',
  'MIN_PITCH',
  'PORT_SEP',
  'TRACK_MARGIN',
  'TRACK_PITCH',
  'TRACK_SPREAD',
  'LEVEL_MARGIN',
  'LEVEL_PITCH',
  'LEVEL_LEAD',
  'LEVEL_CLEAR',
  'LEVEL_TOUCH',
  'SNAP',
  'BEND_SNAP',
  'LEAN_CLEAR',
  'FAN',
  'LOOP',
  'LOOP_GAP',
  'CORNER',
];

describe('layered engine metrics (D77)', () => {
  it.each(['layered.ts', 'compound.ts', 'index.ts'])('%s defines no length constant', (file) => {
    const defined = [...source(file).matchAll(/^const ([A-Z_]+) = /gm)].map((m) => m[1]);
    expect(defined.filter((name) => MOVED.includes(name!))).toEqual([]);
    expect(source(file)).not.toMatch(/node\.w \/ 2 \+ \d+ \+ e\.labelW/);
  });

  // Two parallel edges and a self-loop with a label: ports, tracks and the loop all show.
  const graph: LayoutGraph = {
    direction: 'TB',
    nodes: [
      { id: 'a', width: 120, height: 54 },
      { id: 'b', width: 120, height: 54 },
    ],
    edges: [
      { id: 'ab1', source: 'a', target: 'b', minLen: 1 },
      { id: 'ab2', source: 'a', target: 'b', minLen: 1 },
      { id: 'bb', source: 'b', target: 'b', minLen: 1, label: { width: 30, height: 20 } },
    ],
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    routing: 'stepped',
  };
  const plain = (g: LayoutGraph): unknown => {
    const m = layered(g);
    return { ...m, nodes: [...m.nodes], edges: [...m.edges] };
  };

  it('lays out with the px profile when metrics are absent', () => {
    expect(plain(graph)).toEqual(plain({ ...graph, metrics: pxProfile.engine }));
  });

  it('reads the metrics it is given', () => {
    const doubled = Object.fromEntries(
      Object.entries(pxProfile.engine).map(([k, v]) => [k, v * 2])
    ) as unknown as LayoutMetrics;
    expect(plain({ ...graph, metrics: doubled })).not.toEqual(plain(graph));
  });
});
