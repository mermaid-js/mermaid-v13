// `compass` T0 acceptance (#590, D326): the 20 `e2e/diagrams/architecture` fixtures, built into
// LayoutGraphs by the test-only builder and laid out by `compass(graph)`. Every model is valid
// (no NaN, no overlaps, containment), byte-identical across runs, at least 79 of the 87 facing
// edges (R–L, T–B) run straight between ends on the sides they name, and every `align` pair
// shares its row or column.
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateLayout, type LayoutGraph, type LayoutModel } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { REPO_ROOT, corpusFromDir } from '../index.ts';
import { architectureGraph } from './architecture-graph.ts';

const fixtures: { id: string; source: string }[] = [];

beforeAll(async () => {
  for await (const item of corpusFromDir(
    join(REPO_ROOT, 'e2e/diagrams/architecture'),
    'architecture'
  )) {
    fixtures.push(item);
  }
});

function plain(model: LayoutModel): string {
  return JSON.stringify({
    ...model,
    nodes: [...model.nodes],
    edges: [...model.edges],
    groups: [...model.groups],
  });
}

const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;

/** Facing edges, and those whose ends lie the right way round and in line. */
function facing(graph: LayoutGraph, model: LayoutModel): { total: number; good: string[] } {
  let total = 0;
  const good: string[] = [];
  for (const e of graph.edges) {
    const s = e.sides!.source!;
    const t = e.sides!.target!;
    if (OPPOSITE[s] !== t) continue;
    total++;
    const pts = model.edges.get(e.id)!.points;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    const across = s === 'left' || s === 'right';
    const dir = s === 'right' || s === 'bottom' ? 1 : -1;
    const ahead = across ? (b.x - a.x) * dir > 0 : (b.y - a.y) * dir > 0;
    const inLine = across ? Math.abs(a.y - b.y) < 0.5 : Math.abs(a.x - b.x) < 0.5;
    if (ahead && inLine && pts.length === 2) good.push(e.id);
  }
  return { total, good };
}

/** `align` pairs that share their row (port line) or column, in order. */
function aligned(graph: LayoutGraph, model: LayoutModel): { total: number; good: number } {
  let total = 0;
  let good = 0;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const line = (id: string) => {
    const n = byId.get(id)!;
    const m = model.nodes.get(id)!;
    return { x: m.x, y: m.y - m.height / 2 + (n.anchorY ?? n.height / 2) };
  };
  for (const hint of graph.align ?? []) {
    for (let i = 1; i < hint.members.length; i++) {
      total++;
      const a = line(hint.members[i - 1]!);
      const b = line(hint.members[i]!);
      const ok =
        hint.axis === 'row'
          ? Math.abs(a.y - b.y) < 0.5 && b.x > a.x
          : Math.abs(a.x - b.x) < 0.5 && b.y > a.y;
      if (ok) good++;
    }
  }
  return { total, good };
}

describe('compass over the architecture corpus (D326)', () => {
  it('finds the 20 fixtures', () => {
    expect(fixtures).toHaveLength(20);
  });

  it('lays every fixture out validly, the same on every run', () => {
    for (const { id, source } of fixtures) {
      const { graph } = architectureGraph(source);
      const model = compass(graph);
      expect(validateLayout(graph, model), id).toEqual([]);
      expect(plain(compass(architectureGraph(source).graph)), id).toBe(plain(model));
    }
  });

  it('keeps at least 79 of 87 facing edges straight and on their sides, and every align pair', () => {
    let total = 0;
    let good = 0;
    let pairs = 0;
    let pairsGood = 0;
    const missed: string[] = [];
    for (const { id, source } of fixtures) {
      const { graph } = architectureGraph(source);
      const model = compass(graph);
      const f = facing(graph, model);
      total += f.total;
      good += f.good.length;
      for (const e of graph.edges)
        if (OPPOSITE[e.sides!.source!] === e.sides!.target && !f.good.includes(e.id))
          missed.push(`${id}: ${e.id}`);
      const a = aligned(graph, model);
      pairs += a.total;
      pairsGood += a.good;
    }
    expect(total).toBe(87);
    expect(good, missed.join('\n')).toBeGreaterThanOrEqual(79);
    expect({ pairs, pairsGood }).toEqual({ pairs: 11, pairsGood: 11 });
    expect(missed).toMatchSnapshot();
  });
});
