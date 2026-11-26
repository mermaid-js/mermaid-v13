// `compass` T0 acceptance (#590, D326), reproduced through the parser (#607): the 20
// `e2e/diagrams/architecture` fixtures carried over from v12, parsed and built into LayoutGraphs
// by architecture's own builder (`prepareArchitecture`) and laid out by `compass(graph)`. Every
// model is valid (no NaN, no overlaps, containment), byte-identical across runs, at least 79 of
// the 87 facing edges (R–L, T–B) run straight between ends on the sides they name, and every
// `align` pair shares its row or column.
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateLayout, type LayoutGraph, type LayoutModel } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { layoutBytes, OPPOSITE_SIDE, portLines } from '@mermaid-js/diagram-architecture/testing';
import { REPO_ROOT, corpusFromDir } from '../index.ts';
import { architectureLaidOut } from '../architecture/layout.ts';

const fixtures: { id: string; source: string; graph: LayoutGraph; model: LayoutModel }[] = [];

beforeAll(async () => {
  for await (const item of corpusFromDir(
    join(REPO_ROOT, 'e2e/diagrams/architecture'),
    'architecture'
  )) {
    // D326's metrics are over the 20 fixtures carried over from v12 (all named `should-…`); the
    // port's own fixtures (T1's `lexer-…` and later) are in `architecture/layout.spec.ts`.
    if (!/(^|\/)should-[^/]*$/.test(item.id)) continue;
    const laid = await architectureLaidOut(item.source, compass);
    if (!laid) throw new Error(`${item.id} does not parse`);
    fixtures.push({ ...item, graph: laid.prepared.graph, model: compass(laid.prepared.graph) });
  }
});

/** Facing edges, and those whose ends lie the right way round and in line. */
function facing(graph: LayoutGraph, model: LayoutModel): { total: number; good: string[] } {
  let total = 0;
  const good: string[] = [];
  for (const e of graph.edges) {
    const s = e.sides!.source!;
    const t = e.sides!.target!;
    if (OPPOSITE_SIDE[s] !== t) continue;
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
  const line = portLines(graph, model);
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

  it('lays every fixture out validly, the same on every run', async () => {
    for (const { id, source, graph, model } of fixtures) {
      expect(validateLayout(graph, model), id).toEqual([]);
      const again = await architectureLaidOut(source, compass);
      expect(layoutBytes(compass(again!.prepared.graph)), id).toBe(layoutBytes(model));
    }
  });

  it('keeps at least 79 of 87 facing edges straight and on their sides, and every align pair', () => {
    let total = 0;
    let good = 0;
    let pairs = 0;
    let pairsGood = 0;
    const missed: string[] = [];
    for (const { id, graph, model } of fixtures) {
      const f = facing(graph, model);
      total += f.total;
      good += f.good.length;
      for (const e of graph.edges)
        if (OPPOSITE_SIDE[e.sides!.source!] === e.sides!.target && !f.good.includes(e.id))
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

  it('honours both sides into PE Bus in the nested fixture, and its lines cross no service (#1218, D720)', () => {
    const f = fixtures.find((x) =>
      x.id.endsWith('a-deterministic-layout-for-a-complex-deeply-nested-diagram.mmd')
    )!;
    const at = (id: string) => f.model.nodes.get(id)!;
    // `web:B --> T:pe2` and `vm1:R --> L:pe2`: below Web App, right of VM.
    expect(at('pe2').y).toBeGreaterThan(at('web').y);
    expect(at('pe2').x).toBeGreaterThan(at('vm1').x);
    const crossed: string[] = [];
    for (const e of f.graph.edges) {
      const p = f.model.edges.get(e.id)!.points;
      for (let k = 1; k < p.length; k++) {
        const [u, v] = [p[k - 1]!, p[k]!];
        for (const [id, n] of f.model.nodes) {
          if (id === e.source || id === e.target) continue;
          if (
            Math.min(u.x, v.x) < n.x + n.width / 2 &&
            n.x - n.width / 2 < Math.max(u.x, v.x) &&
            Math.min(u.y, v.y) < n.y + n.height / 2 &&
            n.y - n.height / 2 < Math.max(u.y, v.y)
          )
            crossed.push(`${e.source}->${e.target} x ${id}`);
        }
      }
    }
    expect(crossed).toEqual([]);
  });
});
