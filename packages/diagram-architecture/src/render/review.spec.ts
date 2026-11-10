/**
 * The /code-review findings on #614 (head ef40034ab), one spec each that failed there. Findings
 * 8 (lengths in the metrics table) and 9 (the AST id carried in the scene) are checked by
 * `conformance/src/architecture/layout-literals.spec.ts` and by the round-trip specs.
 */
import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@mermaid-js/core';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import type { InlineSpans, LabelBoxSpan } from '@mermaid-js/core/text';
import { architectureIcons } from '../icons.ts';
import { gridMeasurer, modelOf } from '../layout/fixtures.ts';
import { arrowhead } from './edges.ts';
import { renderArchitectureForTest as render, type RenderArchitectureOptions } from './harness.ts';

const grid: RenderArchitectureOptions = { measurer: gridMeasurer };
const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);
const numbers = (s: string) => s.split(/[ ,]+/).map(Number);
const heads = (svg: string) =>
  [...svg.matchAll(/<polygon class="arrow"[^>]*points="([^"]+)"/g)].map((m) => numbers(m[1]!));
const pathOf = (svg: string) =>
  /<path class="edge"[^>]* d="([^"]+)"/
    .exec(svg)![1]!
    .slice(1)
    .split('L')
    .map((p) => numbers(p));

describe('1: edges follow the ports the engine reports, not the declared sides', () => {
  // An engine that put `b` under `a` and ran `a:R --> L:b` from a's bottom to b's top, as
  // `layered` or ELK may.
  const stacked: LayoutEngine = (graph, ctx) => {
    const m = compass(graph, ctx);
    const a = m.nodes.get('a')!;
    const b = { ...m.nodes.get('b')!, x: a.x, y: a.y + 300 };
    const nodes = new Map(m.nodes).set('b', b);
    const from = { x: a.x, y: a.y + a.height / 2, axis: 'v' as const };
    const to = { x: b.x, y: b.y - b.height / 2, axis: 'v' as const };
    const edges = new Map(m.edges).set('edge:a->b', {
      points: [from, to],
      ports: { source: 'bottom', target: 'top' },
      label: { x: a.x, y: (from.y + to.y) / 2 },
    });
    return { ...m, nodes, edges, height: m.height + 300 };
  };
  const SOURCE =
    'architecture-beta\n  service a(server)[A]\n  service b(server)[B]\n  a:R -[label]-> L:b\n';

  it('draws the route as given, its head on the side it enters, its label up the line', async () => {
    const r = await render(SOURCE, { ...grid, engine: stacked });
    const route = r.layout.edges.get('edge:a->b')!.points;
    const drawn = pathOf(r.svg);
    expect(drawn).toEqual(route.map((p) => [p.x, p.y]));
    expect(heads(r.svg)).toEqual([
      arrowhead('T', route[1]!, 80 / 6).map((v) => Math.round(v * 100) / 100),
    ]);
    expect(r.svg).toMatch(/data-id="edge:a-&gt;b" transform="rotate\(-90,/);
  });
});

describe('2, 3: icon names resolve as v12 resolved them, through the extensions', () => {
  const asked: { name: string; size: number; fallback?: string; pending?: boolean }[] = [];
  const icon = ((name: string, size: number, o?: { fallbackPrefix?: string; pending?: true }) => {
    asked.push({ name, size, fallback: o?.fallbackPrefix, pending: o?.pending });
    return name === 'logos-aws' || name === 'a:b:c'
      ? { tag: 'rect', attrs: { class: 'glyph', width: size, height: size } }
      : undefined;
  }) as RenderContext['icon'];

  it('asks for every non-built-in name as written, with v12 fallback pack', async () => {
    asked.length = 0;
    const r = await render(
      'architecture-beta\n  service a(logos-aws)[A]\n  service b(a:b:c)[B]\n  service c(bogus)[C]\n  service d(server)[D]\n',
      { ...grid, icon }
    );
    expect(asked).toEqual([
      { name: 'logos-aws', size: 80, fallback: 'mermaid-architecture', pending: true },
      { name: 'a:b:c', size: 80, fallback: 'mermaid-architecture', pending: true },
      { name: 'bogus', size: 80, fallback: 'mermaid-architecture', pending: true },
    ]);
    expect((r.svg.match(/class="glyph"/g) ?? []).length).toBe(2);
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(r.warnings[0]!.message).toContain('"bogus"');
  });

  it('lists every non-built-in name with the fallback pack for the icons extension', () => {
    const model = modelOf(
      'architecture-beta\n  service a(logos-aws)[A]\n  service b(logos:aws)[B]\n  service c(bogus)[C]\n  service d(server)[D]\n'
    );
    const pack = 'mermaid-architecture';
    expect(architectureIcons(model)).toEqual([
      { name: 'logos-aws', fallbackPrefix: pack },
      { name: 'logos:aws', fallbackPrefix: pack },
      { name: 'bogus', fallbackPrefix: pack },
    ]);
  });

  it('leaves the square empty while the extension says the pack is loading', async () => {
    const pending = ((_n: string, _s: number, o?: { pending?: true }) =>
      o?.pending ? 'pending' : undefined) as RenderContext['icon'];
    // A name with no colon (v12's dash form): no pack name is cut out of it by hand.
    const r = await render('architecture-beta\n  service a(logos-aws)[A]\n', {
      ...grid,
      icon: pending,
    });
    expect(r.svg).not.toContain('>?</text>');
    expect(codes(r)).toEqual([]);
  });
});

describe('4: ICON_NOT_RENDERED names each icon once', () => {
  it('lists a repeated name once', async () => {
    const r = await render(
      'architecture-beta\n  service a(foo)[A]\n  service b(foo)[B]\n  service c(foo)[C]\n',
      grid
    );
    expect(r.warnings[0]!.message.match(/"foo"/g)).toHaveLength(1);
  });
});

describe('5: an edge the engine did not route keeps its element and warns', () => {
  const dropping: LayoutEngine = (graph, ctx) => {
    const m = compass(graph, ctx);
    const edges = new Map(m.edges);
    edges.delete('edge:a->b');
    return { ...m, edges };
  };

  it('writes an empty path.edge with its data-ast and one ARCHITECTURE_EDGE_NOT_DRAWN', async () => {
    const r = await render(
      'architecture-beta\n  service a(server)[A]\n  service b(server)[B]\n  a:R -- L:b\n  b:R -- L:a\n',
      { ...grid, engine: dropping }
    );
    expect(r.svg).toContain('<path class="edge" data-id="edge:a-&gt;b" data-ast="edge:a-&gt;b"/>');
    expect(r.svg).toMatch(/data-ast="edge:b-&gt;a" d="M/);
    expect(codes(r)).toEqual(['ARCHITECTURE_EDGE_NOT_DRAWN']);
  });
});

describe('6: a text icon keeps lines grown by an inline box inside its square', () => {
  // A 40 px high box (baseline 30) for `$$x$$`, as a math extension would give.
  const box: LabelBoxSpan = {
    kind: 'box',
    text: '$$x$$',
    width: 10,
    height: 40,
    baseline: 30,
    node: { tag: 'rect', attrs: { width: 10, height: 40 } },
  };
  const inline: InlineSpans = {
    extract: (raw) =>
      raw.includes('$$x$$') ? { source: raw.replace('$$x$$', '﷐'), boxes: [box] } : undefined,
    notRendered: () => false,
    warn: () => undefined,
    scratch: {},
  };

  it('cuts to the lines whose real height fits', async () => {
    const r = await render('architecture-beta\n  service a "$$x$$ one two three four"[A]\n', {
      ...grid,
      inline,
    });
    const icon =
      /<g class="architecture-service"[^>]*transform="translate\(([\d.]+),([\d.]+)\)"/.exec(r.svg)!;
    const top = Number(icon[2]);
    const text = /<text class="node-icon-text"[^>]*>(.*?)<\/text>/.exec(r.svg)![1]!;
    const baselines = [...text.matchAll(/<tspan[^>]*y="([\d.]+)"/g)].map((m) => Number(m[1]));
    // Grown first line (30 + 10 below), then 20 px lines: two fit in 78 px, not three.
    expect(baselines.length).toBe(2);
    for (const y of baselines) expect(y - top + 5).toBeLessThanOrEqual(80);
  });
});

describe('7: a head never runs past its own end segment', () => {
  // A one-bend route whose last leg is 5 px long.
  const shortLeg: LayoutEngine = (graph, ctx) => {
    const m = compass(graph, ctx);
    const a = m.nodes.get('a')!;
    const b = { ...m.nodes.get('b')!, y: a.y + 200 };
    const from = { x: a.x + a.width / 2, y: a.y - a.height / 2 + 40, axis: 'h' as const };
    const corner = { x: b.x, y: from.y, axis: 'v' as const };
    const to = { x: b.x, y: from.y + 5, axis: 'v' as const };
    return {
      ...m,
      nodes: new Map(m.nodes).set('b', b),
      edges: new Map(m.edges).set('edge:a->b', {
        points: [from, corner, to],
        ports: { source: 'right', target: 'top' },
      }),
    };
  };

  it('shrinks a head whose base would pass its leg on a bend, and warns', async () => {
    const r = await render(
      'architecture-beta\n  service a(server)[A]\n  service b(server)[B]\n  a:R <--> T:b\n',
      { ...grid, engine: shortLeg }
    );
    const [, last] = heads(r.svg);
    const end = r.layout.edges.get('edge:a->b')!.points[2]!;
    // The base stays on the 5 px leg: 5 + the 2 px tip.
    expect(last).toEqual(arrowhead('T', end, 7).map((v) => Math.round(v * 100) / 100));
    expect(codes(r)).toEqual(['ARCHITECTURE_ARROW_SHRUNK']);
  });
});
