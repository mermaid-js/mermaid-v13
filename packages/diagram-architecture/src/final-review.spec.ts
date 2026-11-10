/**
 * The final whole-branch /code-review of #525 (`feature/525_architecture` at 9b3f9ea5d), one
 * spec per behaviour finding, each failing at 9a75cc4e2. Findings 4 to 7 change no behaviour
 * (dead code, docs, one import, the CDN spec itself).
 */
import { describe, expect, it } from 'vitest';
import { pxProfile, type LayoutEngine, type LayoutSpacing } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { WARNING_NAMES } from './codes.ts';
import { gridMeasurer } from './layout/fixtures.ts';
import { parseArchitecture } from './parser/index.ts';
import { renderArchitectureForTest as render } from './render/harness.ts';

const src = (...lines: string[]) => ['architecture-beta', ...lines].join('\n');

describe('1: an edge whose left id is `accTitle` parses, as in v12', () => {
  it('reads `accTitle{group}:R -- L:b` as an edge', () => {
    const r = parseArchitecture(
      src('group g', 'service accTitle in g', 'service b', 'accTitle{group}:R -- L:b')
    );
    expect(r.diagnostics).toEqual([]);
    expect(r.model.edges).toMatchObject([{ lhsId: 'accTitle', lhsGroup: true, rhsId: 'b' }]);
  });

  it('still asks for `:` after a lone `accTitle`', () => {
    const r = parseArchitecture(src('service b', 'accTitle x'));
    expect(r.diagnostics.map((d) => d.message)).toEqual([
      'Expected `:` after `accTitle`; write it as `accTitle: …`.',
    ]);
  });
});

describe("2: a straight edge's label sits where the engine put it", () => {
  // An engine that reserved room for the label 17 px below the middle of a vertical edge.
  const lowered: LayoutEngine = (graph, ctx) => {
    const m = compass(graph, ctx);
    const e = m.edges.get('edge:a->b')!;
    const label = { x: e.label!.x, y: e.label!.y + 17 };
    return { ...m, edges: new Map(m.edges).set('edge:a->b', { ...e, label }) };
  };
  const SOURCE = src('service a(server)[A]', 'service b(server)[B]', 'a:B -[label]- T:b');

  it('turns the label about the engine point', async () => {
    const plain = await render(SOURCE, { measurer: gridMeasurer });
    const moved = await render(SOURCE, { measurer: gridMeasurer, engine: lowered });
    const at = moved.layout.edges.get('edge:a->b')!.label!;
    expect(plain.svg).not.toContain(`rotate(-90,${at.x},${at.y})`);
    expect(moved.svg).toContain(`rotate(-90,${at.x},${at.y})`);
  });
});

describe('3: ARCHITECTURE_EDGE_NOT_DRAWN lists at most WARNING_NAMES.listed ids', () => {
  const dropping: LayoutEngine = (graph, ctx) => ({ ...compass(graph, ctx), edges: new Map() });

  it('says "and n more"', async () => {
    const n = WARNING_NAMES.listed + 2;
    const services = Array.from({ length: n + 1 }, (_, i) => `service s${String(i)}`);
    const edges = Array.from({ length: n }, (_, i) => `s${String(i)}:R -- L:s${String(i + 1)}`);
    const r = await render(src(...services, ...edges), {
      measurer: gridMeasurer,
      engine: dropping,
    });
    const w = r.warnings.find((x) => x.code === 'ARCHITECTURE_EDGE_NOT_DRAWN');
    expect(w!.message).toContain('"edge:s7->s8"');
    expect(w!.message).not.toContain('"edge:s8->s9"');
    expect(w!.message).toContain(' and 2 more');
  });
});

describe("8: other engines get core's spacing, not the group padding", () => {
  it('hands the engine pxProfile spacing at any padding', async () => {
    const seen: LayoutSpacing[] = [];
    const spy: LayoutEngine = (graph, ctx) => {
      seen.push(graph.spacing);
      return compass(graph, ctx);
    };
    const SOURCE = src('service a', 'service b', 'a:R -- L:b');
    for (const padding of [0, 40, 100])
      await render(SOURCE, { config: { architecture: { padding } }, engine: spy });
    expect(seen).toEqual([1, 2, 3].map(() => pxProfile.builder.spacing));
  });
});
