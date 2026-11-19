// DDLT on parser-produced architecture diagrams (spec #525 T3, #607): every source of the
// e2e corpus, the harvested v12 spec strings and the hand-written cases that parses without an
// error is measured by `prepareArchitecture` (core's table measurer, the source's config and
// theme) and given to `compass(graph)` as `layoutArchitecture` gives it (labels of straight level
// edges left out). The spec's invariants hold on each: no NaN, no
// overlaps, containment and contents in the bounding box (`validateLayout`), edges on the sides
// they name, facing edges between nodes in line straight, `align` members sharing their row or
// column, and the same bytes on every run. D326's corpus numbers over the 20 v12 fixtures are in
// `compass/architecture-corpus.spec.ts`.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  validateLayout,
  type LayoutEngine,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import {
  architectureLayoutProblems,
  facingInLine,
  layoutBytes,
  portLines,
  renderArchitectureForTest,
} from '@mermaid-js/diagram-architecture/testing';
import { architectureCases, architectureCorpus } from './corpus.ts';
import { architectureLaidOut, type ArchitectureLaidOut } from './layout.ts';

interface Fixture extends ArchitectureLaidOut {
  readonly id: string;
  readonly source: string;
  /** `compass(prepared.graph)`, laid out once. */
  readonly layout: LayoutModel;
}

const fixtures: Fixture[] = [];

beforeAll(async () => {
  for (const item of [...(await architectureCorpus()), ...architectureCases()]) {
    const laid = await architectureLaidOut(item.source, compass);
    if (laid)
      fixtures.push({
        id: item.id,
        source: item.source,
        ...laid,
        layout: compass(laid.prepared.graph),
      });
  }
}, 60_000);

const byId = (suffix: string): Fixture => {
  const f = fixtures.find((x) => x.id.endsWith(suffix));
  if (!f) throw new Error(`no fixture ${suffix}`);
  return f;
};

describe('architecture layout over parser-produced fixtures (#607)', () => {
  it('covers the corpus: groups, junctions, labels, {group} ends, align, like-side and self edges', () => {
    expect(fixtures.length).toBeGreaterThan(100);
    const models = fixtures.map((f) => f.model);
    expect(models.filter((m) => m.groups.length > 0).length).toBeGreaterThan(10);
    expect(models.filter((m) => m.junctions.length > 0).length).toBeGreaterThan(3);
    const edges = models.flatMap((m) => m.edges);
    expect(edges.filter((e) => e.title).length).toBeGreaterThan(5);
    expect(edges.filter((e) => e.lhsGroup || e.rhsGroup).length).toBeGreaterThan(3);
    expect(edges.filter((e) => e.lhsDir === e.rhsDir).length).toBeGreaterThan(0);
    expect(edges.filter((e) => e.lhsId === e.rhsId).length).toBeGreaterThan(0);
    expect(models.filter((m) => m.alignments.length > 0).length).toBeGreaterThan(3);
  });

  it('keeps every invariant on every fixture, the same bytes on every run', async () => {
    const problems: string[] = [];
    for (const f of fixtures) {
      const graph = f.prepared.graph;
      const model = f.layout;
      for (const p of [
        ...validateLayout(graph, model),
        ...architectureLayoutProblems(graph, model),
      ])
        problems.push(`${f.id}: ${p}`);
      const again = await architectureLaidOut(f.source, compass);
      if (layoutBytes(compass(again!.prepared.graph)) !== layoutBytes(model))
        problems.push(`${f.id}: differs between runs`);
    }
    expect(problems).toEqual([]);
  });

  it('lays out every service and junction, and every group and edge, by its model id', () => {
    for (const f of fixtures) {
      const model = f.layout;
      const nodes = [...f.model.services, ...f.model.junctions].map((n) => n.id);
      expect([...model.nodes.keys()].sort(), f.id).toEqual([...nodes].sort());
      expect([...model.groups.keys()].sort(), f.id).toEqual(f.model.groups.map((g) => g.id).sort());
      expect([...model.edges.keys()], f.id).toEqual(f.model.edges.map((e) => e.astId));
    }
  });

  it('meets every facing edge between nodes in line straight on the corpus', () => {
    // Not vacuous: most facing edges of the corpus are between nodes in line.
    let count = 0;
    for (const f of fixtures) count += facingInLine(f.prepared.graph, f.layout).length;
    expect(count).toBeGreaterThan(100);
  });

  it('routes a run between two bends round every node but its ends (#767, D507)', () => {
    // Straight and one-bend routes keep v12's line even through a node (D507); a route with two
    // or more bends goes round. Not vacuous: the corpus has such routes beside nodes.
    const crossed: string[] = [];
    let bent = 0;
    for (const f of fixtures) {
      for (const edge of f.prepared.graph.edges) {
        const p = f.layout.edges.get(edge.id)?.points ?? [];
        if (p.length < 4) continue;
        bent++;
        for (let k = 1; k + 2 < p.length; k++) {
          const [u, v] = [p[k]!, p[k + 1]!];
          for (const [id, n] of f.layout.nodes) {
            if (id === edge.source || id === edge.target) continue;
            const inside =
              Math.min(u.x, v.x) < n.x + n.width / 2 &&
              n.x - n.width / 2 < Math.max(u.x, v.x) &&
              Math.min(u.y, v.y) < n.y + n.height / 2 &&
              n.y - n.height / 2 < Math.max(u.y, v.y);
            if (inside) crossed.push(`${f.id}: ${edge.id} x ${id}`);
          }
        }
      }
    }
    expect(bent).toBeGreaterThan(20);
    expect(crossed).toEqual([]);
    expect(byId('layout-group-edge-detours-round-a-service.mmd').layout.edges.size).toBe(3);
  });

  it('follows bends as written where v12 placed them the wrong way up (research Q5)', () => {
    // v12 12.2.0 put `b` above the a–c row for `a:R -- T:b` and `e` below the d–f row for
    // `d:L -- B:e` (architectureTypes.ts:141; GAPS T3).
    const f = byId('layout-bends-follow-written-sides.mmd');
    const at = portLines(f.prepared.graph, f.layout);
    expect(at('c').y).toBe(at('a').y);
    expect(at('b').y).toBeGreaterThan(at('a').y);
    expect(at('b').x).toBeGreaterThan(at('a').x);
    expect(at('f').y).toBe(at('d').y);
    expect(at('e').y).toBeLessThan(at('d').y);
    expect(at('e').x).toBeLessThan(at('d').x);
  });

  it('wraps a long label on a level edge to the line, at the default gap (#774)', async () => {
    const f = byId('layout-level-edge-label-wraps-to-the-line.mmd');
    const gap = (layout: LayoutModel): number => {
      const a = layout.nodes.get('a')!;
      const b = layout.nodes.get('b')!;
      return b.x - b.width / 2 - (a.x + a.width / 2);
    };
    // The engine is not given the label, so the gap is the one the same edge gets unlabelled.
    expect(f.prepared.graph.edges[0]!.label).toBeUndefined();
    const bare = await architectureLaidOut(f.source.replace(/-\[[^\]]*\]-/, '--'), compass);
    expect(gap(f.layout)).toBe(gap(compass(bare!.prepared.graph)));
    expect(f.prepared.edges[0]!.label!.width).toBeGreaterThan(gap(f.layout));
    // The renderer wraps it to the line (the services' one-line labels have no tspans).
    const { svg } = await renderArchitectureForTest(f.source);
    const lines = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThan(1);
    // Every character, in order: a word wider than the line is broken across two.
    const letters = (t: string): string => t.replace(/\s/g, '');
    expect(letters(lines.join(''))).toBe(letters(f.model.edges[0]!.title!));
  });

  it('lays a labelled level edge out once when it runs straight, twice when it does not', async () => {
    const f = byId('layout-level-edge-label-wraps-to-the-line.mmd');
    const seen: LayoutGraph[] = [];
    const counting: LayoutEngine = (graph) => (seen.push(graph), compass(graph));
    await architectureLaidOut(f.source, counting);
    // The trial without the label is the layout.
    expect(seen.map((g) => g.edges[0]!.label)).toEqual([undefined]);
    // An engine that bends the edge gets the label back on a second layout, to make room for it.
    seen.length = 0;
    const bending: LayoutEngine = (graph) => {
      seen.push(graph);
      const m = compass(graph);
      const [p, q] = m.edges.get('edge:a->b')!.points;
      const mid = (p!.x + q!.x) / 2;
      const bent = [
        p!,
        { x: mid, y: p!.y, axis: 'h' as const },
        { x: mid, y: q!.y + 1, axis: 'v' as const },
        { ...q!, y: q!.y + 1 },
      ];
      return {
        ...m,
        edges: new Map([['edge:a->b', { ...m.edges.get('edge:a->b')!, points: bent }]]),
      };
    };
    await architectureLaidOut(f.source, bending);
    expect(seen.map((g) => g.edges[0]!.label === undefined)).toEqual([true, false]);
    // `layered` and `dagre` never draw it straight: one layout, with the label.
    seen.length = 0;
    const flow = await architectureLaidOut(
      `%%{init: {"layout": "dagre"}}%%\n${f.source}`,
      counting
    );
    expect(flow!.warnings).toContain('ARCHITECTURE_PLACEMENT_IGNORED');
    expect(seen.map((g) => g.edges[0]!.label === undefined)).toEqual([false]);
  });

  it("sizes boxes from the document's iconSize and padding", () => {
    const f = byId('layout-icon-size-and-padding.mmd');
    expect(f.warnings).toEqual([]);
    const { graph, sizes } = f.prepared;
    expect([sizes.iconSize, sizes.padding, sizes.labelWidth]).toEqual([120, 20, 180]);
    const hub = graph.nodes.find((n) => n.id === 'hub')!;
    expect([hub.width, hub.height, hub.anchorY]).toEqual([120, 120, 60]);
    const web = graph.nodes.find((n) => n.id === 'web')!;
    expect(web.width).toBeLessThanOrEqual(180);
    expect(web.height).toBeGreaterThan(120);
    for (const g of graph.groups)
      expect(g.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
    expect(graph.diagramPadding).toBe(20);
    expect(validateLayout(graph, f.layout)).toEqual([]);
  });

  it("measures in the source's theme and themeVariables, as a render does", async () => {
    // The harness builds the theme as kanban's does: theme name ('auto' too), themeVariables.
    const big = await architectureLaidOut(
      '%%{init: {"themeVariables": {"fontSize": "32px", "fontFamily": "Courier"}}}%%\narchitecture-beta\n  service a[Alpha]',
      compass
    );
    expect(big!.prepared.font).toMatchObject({ size: 32, family: 'Courier' });
    const plain = await architectureLaidOut('architecture-beta\n  service a[Alpha]', compass);
    expect(big!.prepared.nodes[0]!.label!.height).toBeGreaterThan(
      plain!.prepared.nodes[0]!.label!.height
    );
    const auto = await architectureLaidOut(
      '---\nconfig:\n  theme: auto\n---\narchitecture-beta\n  service a[Alpha]',
      compass
    );
    expect(auto!.warnings).toEqual([]);
  });
});
