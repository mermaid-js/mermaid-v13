import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig } from '@mermaid-js/core/config';
import {
  cellProfile,
  countCrossings,
  layered,
  pxProfile,
  validateLayout,
  type LayoutGraph,
  type LayoutModel,
  type UnitProfile,
} from '@mermaid-js/core/layout';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import {
  layoutState,
  parseState,
  type StateLayout,
  type StateModel,
} from '@mermaid-js/diagram-state';
import { REPO_ROOT, corpusFromDir } from '../index.ts';

// DDLT checks on parser-produced state graphs (#144, DESIGN §6.2): both e2e state corpora,
// parsed by the v13 parser and measured with the table measurer, so the fixtures are always
// fresh. Every graph must lay out validly, before and after the region stretch, and every
// composite with regions must pass the #140 region checks (`research/state-regions.md`).

interface Item {
  id: string;
  model: StateModel;
}
const corpus: Item[] = [];
let spec: ThemeSpec;

beforeAll(async () => {
  spec = await loadTheme('redux');
  for (const dir of ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2']) {
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), dir)) {
      const result = parseState(item.source);
      if (result.diagnostics.some((d) => d.severity === 'error')) continue;
      corpus.push({ id: item.id, model: result.model });
    }
  }
}, 120_000);

function run(
  model: StateModel,
  units: UnitProfile,
  measurer: Measurer
): { graph: LayoutGraph; laid: LayoutModel; layout: StateLayout } {
  let graph: LayoutGraph | undefined;
  let laid: LayoutModel | undefined;
  const layout = layoutState(model, {
    config: resolveConfig(CORE_DEFAULTS),
    measurer,
    units,
    theme: createTheme(spec, {}),
    warn: () => {},
    layout: (g) => {
      graph = g;
      laid = layered(g);
      return laid;
    },
  });
  return { graph: graph!, laid: laid!, layout };
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const SLACK = 0.5;
const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  x0: b.x - b.width / 2,
  y0: b.y - b.height / 2,
  x1: b.x + b.width / 2,
  y1: b.y + b.height / 2,
});
const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

/** The #140 region checks, plus edge-label frames; one message per problem. */
function regionProblems(graph: LayoutGraph, layout: StateLayout, checked: string[]): string[] {
  const problems: string[] = [];
  const prepared = layout.state!;
  const parentOf = new Map<string, string | undefined>();
  for (const n of graph.nodes) parentOf.set(n.id, n.parent);
  for (const g of graph.groups) parentOf.set(g.id, g.parent);
  const chain = (id: string): string[] => {
    const out: string[] = [];
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) out.push(p);
    return out;
  };
  const regionIds = new Set([...prepared.regions.values()].flat());
  const regionOf = (id: string) => chain(id).find((p) => regionIds.has(p));
  const g = (id: string): Rect => rectOf(layout.groups.get(id)!);

  for (const [comp, regs] of prepared.regions) {
    // D113: a transition between two sibling regions stacks them; such composites are skipped.
    const sibling = graph.edges.some((e) => {
      const a = regionOf(e.source);
      const b = regionOf(e.target);
      return a && b && a !== b && parentOf.get(a) === comp && parentOf.get(b) === comp;
    });
    if (sibling || regs.length < 2) continue;
    checked.push(comp);
    const flow = (prepared.views.get(comp) as { flow: string }).flow;
    const spreadX = flow === 'TB' || flow === 'BT';
    const rs = regs.map((r) => ({ id: r, ...g(r) }));
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i]!;
        const c = rs[j]!;
        const across = spreadX ? overlap(a.x0, a.x1, c.x0, c.x1) : overlap(a.y0, a.y1, c.y0, c.y1);
        const along = spreadX ? overlap(a.y0, a.y1, c.y0, c.y1) : overlap(a.x0, a.x1, c.x0, c.x1);
        if (across > SLACK) problems.push(`regions '${a.id}' and '${c.id}' are not side by side`);
        else if (along <= SLACK) problems.push(`regions '${a.id}' and '${c.id}' share no band`);
      }
    }
    const key = (r: Rect): number => (spreadX ? r.x0 : r.y0);
    const sorted = [...rs].sort((p, q) => key(p) - key(q));
    for (let i = 1; i < sorted.length; i++) {
      const p = sorted[i - 1]!;
      const q = sorted[i]!;
      if ((spreadX ? q.x0 - p.x1 : q.y0 - p.y1) < 1) {
        problems.push(`${comp}: no room for a divider between '${p.id}' and '${q.id}'`);
      }
    }
    const dividers = layout.dividers.filter((d) => d.composite === comp);
    if (dividers.length !== regs.length - 1) problems.push(`${comp}: wrong divider count`);
  }

  for (const e of graph.edges) {
    const placed = layout.edges.get(e.id)!;
    // An edge inside one region stays out of its siblings.
    const hs = regionOf(e.source);
    if (hs && hs === regionOf(e.target)) {
      for (const sib of prepared.regions.get(parentOf.get(hs)!)!) {
        if (sib === hs) continue;
        const r = g(sib);
        const inside = placed.points.some(
          (p) =>
            p.x > r.x0 + SLACK && p.x < r.x1 - SLACK && p.y > r.y0 + SLACK && p.y < r.y1 - SLACK
        );
        if (inside) problems.push(`edge '${e.id}' runs into sibling region '${sib}'`);
      }
    }
    // A label does not straddle a composite's frame (regions are not drawn as frames).
    if (e.label && placed.label) {
      const l = rectOf({ ...placed.label, ...e.label });
      for (const gr of graph.groups) {
        if (regionIds.has(gr.id)) continue;
        const r = g(gr.id);
        const hit =
          overlap(l.x0, l.x1, r.x0, r.x1) > SLACK && overlap(l.y0, l.y1, r.y0, r.y1) > SLACK;
        const within =
          l.x0 >= r.x0 - SLACK &&
          l.x1 <= r.x1 + SLACK &&
          l.y0 >= r.y0 - SLACK &&
          l.y1 <= r.y1 + SLACK;
        if (hit && !within) problems.push(`label of '${e.id}' straddles the frame of '${gr.id}'`);
      }
    }
  }
  return problems;
}

// Engine gaps: none. A group's self-loop (`Active --> Active`) ran off the drawing until state
// T0 #187 made `layered` count it in the drawing's extent.
const ENGINE_GAPS: Readonly<Record<string, readonly string[]>> = {};

describe('layered over parser-produced state graphs', () => {
  it('reads both corpora', () => {
    expect(corpus.length).toBeGreaterThan(140);
  });

  it('lays out every corpus graph validly, regions side by side, and records crossings', () => {
    const crossings: Record<string, number> = {};
    const failures: Record<string, string[]> = {};
    const checked: string[] = [];
    for (const item of corpus) {
      const { graph, laid, layout } = run(item.model, pxProfile, tableMeasurer);
      const problems = [
        ...validateLayout(graph, laid),
        // The stretched frames still hold their members and keep clear of everything else.
        ...validateLayout(graph, layout).map((p) => `stretched: ${p}`),
        ...regionProblems(graph, layout, checked),
      ];
      if (problems.length > 0) failures[item.id] = problems;
      crossings[item.id] = countCrossings(laid);
    }
    expect(failures).toEqual(ENGINE_GAPS);
    // The 29 corpus files with `--` (#140), some with several split composites.
    expect(checked.length).toBeGreaterThanOrEqual(29);
    expect(crossings).toMatchSnapshot();
  });

  it('lays out every corpus graph in cells with whole lengths', () => {
    const failures: Record<string, string[]> = {};
    for (const item of corpus) {
      const { graph, laid } = run(item.model, cellProfile(), cellMeasurer);
      const problems = validateLayout(graph, laid);
      for (const n of graph.nodes) {
        if (!Number.isInteger(n.width) || !Number.isInteger(n.height)) {
          problems.push(`node '${n.id}' is ${n.width} × ${n.height}`);
        }
      }
      if (problems.length > 0) failures[item.id] = problems;
    }
    expect(failures).toEqual({});
  });
});
