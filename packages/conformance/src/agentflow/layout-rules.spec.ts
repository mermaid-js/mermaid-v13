import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ConfigInput } from '@mermaid-js/core/config';
import {
  layered,
  pxProfile,
  validateLayout,
  type LayoutEngine,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { layoutAgentflow, shapeOutline, type AgentflowLayout } from '@mermaid-js/diagram-agentflow';
import {
  agentflowLayoutProblems,
  parseAgentflowForTest,
} from '@mermaid-js/diagram-agentflow/testing';
import elkLayouts from '@mermaid-js/layout-elk';
import { REPO_ROOT } from '../index.ts';

// The agentflow graph builder (spec #523 T3) at its seam: `.mmd` fixtures under
// `e2e/diagrams/agentflow/baseline/` (gallery fixtures) and `nightly-check/` (those whose rule
// is a warning: the gallery draws without warnings, #550), found by name, parsed through the
// plugin's parse path → LayoutGraph → LayoutModel, with v12's `getData` rules pinned one by
// one, under `layered` and ELK. The context records the graph the builder hands the engine.

const FOLDERS = ['baseline', 'nightly-check'];
let byName: Map<string, string[]> | undefined;
/** The fixture `<name>.mmd`, wherever it is under {@link FOLDERS}; the one of that name. */
function fixture(name: string): string {
  if (!byName) {
    byName = new Map();
    for (const folder of FOLDERS) {
      const root = join(REPO_ROOT, 'e2e/diagrams/agentflow', folder);
      for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
        if (!file.endsWith('.mmd')) continue;
        const key = basename(file, '.mmd');
        byName.set(key, [...(byName.get(key) ?? []), join(root, file)]);
      }
    }
  }
  const paths = byName.get(name) ?? [];
  if (paths.length !== 1) throw new Error(`${paths.length} agentflow fixtures named ${name}`);
  return readFileSync(paths[0]!, 'utf8');
}

const engines: Record<string, LayoutEngine> = { layered };
beforeAll(async () => {
  engines.elk = await elkLayouts.find((l) => l.name === 'elk')!.loader();
});

interface Run {
  graph: LayoutGraph;
  model: LayoutModel;
  layout: AgentflowLayout;
  warnings: { code: string; path?: string }[];
  problems: string[];
}

// Every rule under each engine: the rules are the builder's, the ends the layout's.
describe.each(['layered', 'elk'])('%s', (engine) => {
  async function run(name: string, site: ConfigInput = {}): Promise<Run> {
    const {
      parse: parsed,
      config,
      theme,
    } = await parseAgentflowForTest(fixture(name), {
      config: site,
    });
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    let graph: LayoutGraph | undefined;
    let model: LayoutModel | undefined;
    const warnings: Run['warnings'] = [];
    const layout = layoutAgentflow(parsed.model, {
      config,
      measurer: tableMeasurer,
      units: pxProfile,
      theme,
      warn: (w) => warnings.push({ code: w.code, ...(w.path ? { path: w.path } : {}) }),
      layout: (g) => {
        graph = g;
        model = engines[engine]!(g, { config });
        return model;
      },
    });
    const problems = [
      ...validateLayout(graph!, layout),
      ...agentflowLayoutProblems(parsed.model, layout),
    ];
    return { graph: graph!, model: model!, layout, warnings, problems };
  }

  const ends = (g: LayoutGraph) => g.edges.map((e) => `${e.source}>${e.target}`);
  /** How far each end on a flow lies off that flow's frame border. */
  const offFrames = (r: Run): number[] =>
    r.graph.edges.flatMap((e) => {
      const points = r.layout.edges.get(e.id)!.points;
      return [
        [e.source, points[0]!],
        [e.target, points[points.length - 1]!],
      ].flatMap(([id, p]) => {
        const f = r.layout.groups.get(id as string);
        if (!f) return [];
        const { x, y } = p as { x: number; y: number };
        const dx = Math.abs(x - f.x) - f.width / 2;
        const dy = Math.abs(y - f.y) - f.height / 2;
        // Outside: the distance to the box; inside: to the nearest side.
        return [
          dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : -Math.max(dx, dy),
        ];
      });
    });
  const node = (g: LayoutGraph, id: string) => g.nodes.find((n) => n.id === id);
  const group = (g: LayoutGraph, id: string) => g.groups.find((n) => n.id === id);

  describe('collapsed flows (v12 getData)', () => {
    it('keeps an authored self-loop on the card, drops a fold, redirects edges across it', async () => {
      const r = await run('collapsed-flow-keeps-authored-self-loop');
      expect(r.problems).toEqual([]);
      expect(r.graph.nodes.map((n) => [n.id, n.shape])).toEqual(
        expect.arrayContaining([
          ['worker', 'collapsedGroup'],
          ['start', 'lean-r'],
          ['done', 'lin-doc'],
        ])
      );
      expect(node(r.graph, 'plan')).toBeUndefined();
      expect(node(r.graph, 'act')).toBeUndefined();
      expect(r.graph.groups).toEqual([]);
      // `plan --> plan` is authored: kept as worker → worker (flowchart v13 drops it). `plan -->
      // act` folds into the card: dropped.
      expect(ends(r.graph)).toEqual(['worker>worker', 'start>worker', 'worker>done']);
    });

    it('folds nested collapsed flows into the outermost one, inside an open flow', async () => {
      const r = await run('nested-collapsed-flows');
      expect(r.problems).toEqual([]);
      expect(r.graph.groups.map((g) => [g.id, g.parent])).toEqual([
        ['team', undefined],
        ['review', 'team'],
      ]);
      expect(node(r.graph, 'research')).toMatchObject({ shape: 'collapsedGroup', parent: 'team' });
      for (const hidden of ['sources', 'web', 'docs', 'summarise'])
        expect(node(r.graph, hidden), hidden).toBeUndefined();
      expect(ends(r.graph)).toEqual([
        'lead>research',
        'research>check',
        'check>lead',
        'check>lead',
      ]);
    });
  });

  describe('edges', () => {
    it('drops an edge from a member to the collapsed flow that holds it (v12)', async () => {
      const r = await run('edge-into-own-collapsed-flow');
      expect(r.problems).toEqual([]);
      expect(r.graph.nodes.map((n) => [n.id, n.shape])).toEqual([
        ['f', 'collapsedGroup'],
        ['c', 'rounded'],
      ]);
      expect(ends(r.graph)).toEqual(['c>f']);
    });

    it('leaves out an edge from the reserved `connectors` id', async () => {
      const r = await run('edge-from-reserved-connectors-id');
      expect(r.problems).toEqual([]);
      expect(r.graph.nodes.map((n) => n.id)).toEqual(['b', 'a']);
      expect(ends(r.graph)).toEqual(['a>b']);
    });

    it('ends edges to a flow on its frame, and cuts mutual containment (D461)', async () => {
      const r = await run('mutual-containment-cut');
      expect(r.problems).toEqual([]);
      // `a1 --> B` from inside B and `b1 --> A`: every frame end on the frame's border.
      const off = offFrames(r);
      expect(off).toHaveLength(2);
      for (const d of off) expect(d).toBeLessThanOrEqual(0.5);
      const parents = new Map(r.graph.groups.map((g) => [g.id, g.parent]));
      expect([...parents.keys()].sort()).toEqual(['A', 'B']);
      // One holds the other, never both.
      expect([parents.get('A'), parents.get('B')].filter(Boolean)).toHaveLength(1);
      expect(ends(r.graph)).toEqual(['a1>B', 'b1>A']);
    });

    it('puts every end on a node on that node outline, for every shape', async () => {
      for (const name of ['every-shape-many-ends-tb', 'every-shape-many-ends-lr']) {
        const r = await run(name);
        expect(r.problems, name).toEqual([]);
        // The decision's ends left its layout box: a diamond meets few box sides.
        const d = r.layout.nodes.get('d')!;
        const off = [...r.layout.edges.entries()]
          .filter(([id]) => r.graph.edges.find((e) => e.id === id)?.source === 'd')
          .map(([, e]) => e.points[0]!)
          .filter(
            (p) =>
              Math.abs(Math.abs(p.x - d.x) - d.width / 2) > 1 &&
              Math.abs(Math.abs(p.y - d.y) - d.height / 2) > 1
          );
        expect(off.length, name).toBeGreaterThan(0);
      }
    });
  });

  describe('flows as groups', () => {
    it('gives each flow its own direction, and passes `algorithm` for ELK (D174)', async () => {
      const r = await run('flow-directions-and-algorithm');
      expect(r.problems).toEqual([]);
      expect(r.graph.direction).toBe('LR');
      expect(group(r.graph, 'pipeline')).toMatchObject({ direction: 'TB' });
      expect(group(r.graph, 'output')).toMatchObject({ direction: 'RL' });
      expect(group(r.graph, 'tools')?.direction).toBeUndefined();
      expect(group(r.graph, 'tools')).toMatchObject({
        parent: 'pipeline',
        algorithm: 'elk.rectpacking',
      });
      expect(r.graph.groups.map((g) => g.id)).toEqual(['pipeline', 'output', 'tools']);
      expect(ends(r.graph)).toContain('input>pipeline');
    });

    it('reads `flowchart.inheritDir` through the parser (D466)', async () => {
      expect(group((await run('inherited-flow-direction')).graph, 'steps')?.direction).toBe('LR');
      const own = await run('inherited-flow-direction', { flowchart: { inheritDir: false } });
      // Front matter wins over site config: still inherited.
      expect(group(own.graph, 'steps')?.direction).toBe('LR');
      expect(group(own.graph, 'other')?.direction).toBe('TB');
    });
  });

  describe('config lengths', () => {
    it('reads spacing, wrap and least width from `agentflow`, padding from `flowchart`', async () => {
      const r = await run('config-lengths');
      expect(r.problems).toEqual([]);
      expect(r.warnings).toEqual([]);
      expect(r.graph.spacing).toMatchObject({ node: 90, rank: 30 });
      expect(r.graph.diagramPadding).toBe(20);
      const view = r.layout.agentflow.views;
      // Wrapped at 60, then 2 × `flowchart.padding` (4) around the label.
      expect(view.get('a')!.label.width).toBeLessThanOrEqual(60);
      expect(view.get('a')!.label.lines.length).toBeGreaterThan(1);
      expect(view.get('a')!.w).toBe(Math.max(view.get('a')!.label.width, 40) + 8);
      // A short label is widened to `minNodeWidth` (40).
      expect(view.get('b')!.w).toBe(40 + 8);
      // The title margin (6 + 4) is added to the frame's top padding.
      const f = group(r.graph, 'f')!;
      expect(f.padding.top).toBe(pxProfile.builder.titlePad + 10);
    });

    it('defaults to v12: spacing 50, wrap and least width 120, padding 15', async () => {
      const r = await run('edge-from-reserved-connectors-id');
      expect(r.graph.spacing).toMatchObject({ node: 50, rank: 50 });
      expect(r.graph.diagramPadding).toBe(8);
      const b = r.layout.agentflow.views.get('b')!;
      expect(b.w).toBe(120 + 2 * 15);
      expect(b.h).toBe(b.label.height + 2 * 15);
    });

    it('warns once per length it cannot honour and draws with the default', async () => {
      const r = await run('edge-from-reserved-connectors-id', {
        agentflow: { nodeSpacing: '20px' as unknown as number, wrappingWidth: -5 },
        flowchart: { padding: true as unknown as number },
      });
      expect(r.warnings).toEqual([
        { code: 'AGENTFLOW_CONFIG_INVALID', path: 'flowchart.padding' },
        { code: 'AGENTFLOW_CONFIG_INVALID', path: 'agentflow.wrappingWidth' },
        { code: 'AGENTFLOW_CONFIG_INVALID', path: 'agentflow.nodeSpacing' },
      ]);
      expect(r.graph.spacing.node).toBe(50);
      expect(r.layout.agentflow.views.get('b')!.w).toBe(120 + 2 * 15);
    });
  });

  describe('shape outlines', () => {
    it('closes each outline inside its box', async () => {
      const { geometry } = (await run('edge-from-reserved-connectors-id')).layout.agentflow;
      for (const shape of [
        'rounded',
        'fr-rect',
        'lean-r',
        'diam',
        'lin-doc',
        'hex',
        'collapsedGroup',
      ] as const) {
        const o = shapeOutline(shape, 120, 60, geometry);
        expect(o.length, shape).toBeGreaterThanOrEqual(4);
        for (const p of o) {
          expect(Math.abs(p.x), shape).toBeLessThanOrEqual(60 + 1e-9);
          expect(Math.abs(p.y), shape).toBeLessThanOrEqual(30 + 1e-9);
        }
      }
    });
  });
});
