import { describe, expect, it } from 'vitest';
import type { MermaidConfig } from '@mermaid-js/core/config';
import { layered, type LayoutEngine, type LayoutModel } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { ARCHITECTURE_PLACEMENT_IGNORED } from '@mermaid-js/diagram-architecture';
import elkLayouts from '@mermaid-js/layout-elk';
import { createMermaid } from 'mermaid';

// The engine an architecture diagram is laid out with (#673, D560), through
// `createMermaid().render()`: the one `layout` names, from front matter, `initialize()` or the
// `architecture` section, `compass` when none does (D327). `layered` and v12's `dagre` lay it out
// down the flow, with the sides only where lines attach (D503), and say what they leave out with
// one ARCHITECTURE_PLACEMENT_IGNORED warning; `compass` and an installed ELK warn nothing. Each
// engine is registered under its own name with a recorder, so the spec sees which one laid the
// graph out and where it put each node.

/** The issue's chains: every `a:R --> L:b` puts `b` right of `a` under `compass`. */
const CHAINS = `architecture-beta
 group g0(cloud)[G0]
 service a(server)[A] in g0
 service b(server)[B] in g0
 service c(server)[C] in g0
 a:R --> L:b
 b:R --> L:c
 group g1(cloud)[G1]
 service d(server)[D] in g1
 service e(server)[E] in g1
 d:R --> L:e
 c:B --> T:d
`;

/** The issue's four-armed junction. */
const JUNCTION = `architecture-beta
    service top(server)[Top]
    junction j1
    junction j2
    service l(server)[Left]
    service r(server)[Right]
    service bot(server)[Bottom]
    top:B -- T:j1
    j1:L -- R:l
    j1:R -- L:r
    j1:B -- T:j2
    j2:B -- T:bot
`;

/** A group, a junction in it, an edge label and a `{group}` end. */
const GROUPED = `architecture-beta
 group api(cloud)[API]
 service db(database)[Database] in api
 service server(server)[Server] in api
 junction j in api
 service web(internet)[Web]
 db:L -[reads]-> R:server
 server:B -- T:j
 server{group}:R --> L:web
`;

const withFrontMatter = (layout: string, source: string): string =>
  `---\nconfig:\n  layout: ${layout}\n---\n${source}`;

interface Laid {
  readonly engine: string;
  readonly model: LayoutModel;
}

async function render(source: string, config: MermaidConfig = {}, elk = false) {
  const laid: Laid[] = [];
  const recorded = (engine: string, run: LayoutEngine): LayoutEngine => {
    return (graph, ctx) => {
      const model = run(graph, ctx);
      laid.push({ engine, model });
      return model;
    };
  };
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  m.registerLayoutLoaders([
    { name: 'compass', loader: () => Promise.resolve(recorded('compass', compass)) },
    { name: 'layered', loader: () => Promise.resolve(recorded('layered', layered)) },
    { name: 'dagre', loader: () => Promise.resolve(recorded('dagre', layered)) },
    ...(elk
      ? elkLayouts.map((l) => ({
          ...l,
          loader: async () => recorded(l.name, await l.loader()),
        }))
      : []),
  ]);
  const r = await m.render('arch', source);
  expect(laid).toHaveLength(1);
  return { ...laid[0]!, warnings: r.warnings, svg: r.svg };
}

const at = (model: LayoutModel, id: string) => model.nodes.get(id)!;

/**
 * `b` sits right of `a` on one row, the `a:R --> L:b` placement: their centres less than half the
 * taller box apart (a service's box holds its label under the icon, so centres need not match).
 */
function expectRightOf(model: LayoutModel, a: string, b: string): void {
  const [p, q] = [at(model, a), at(model, b)];
  expect(q.x - q.width / 2, `${b} right of ${a}`).toBeGreaterThan(p.x + p.width / 2);
  const dy = Math.abs(q.y - p.y);
  expect(dy, `${b} level with ${a}`).toBeLessThan(Math.max(p.height, q.height) / 2);
}

function expectChains(model: LayoutModel): void {
  expectRightOf(model, 'a', 'b');
  expectRightOf(model, 'b', 'c');
  expectRightOf(model, 'd', 'e');
  expect(at(model, 'd').y).toBeGreaterThan(at(model, 'c').y);
}

function expectJunction(model: LayoutModel): void {
  expectRightOf(model, 'l', 'j1');
  expectRightOf(model, 'j1', 'r');
  expect(at(model, 'top').y).toBeLessThan(at(model, 'j1').y);
  expect(at(model, 'j2').y).toBeGreaterThan(at(model, 'j1').y);
  expect(at(model, 'bot').y).toBeGreaterThan(at(model, 'j2').y);
}

/** `b` is ranked below `a`: layered's flow, whatever side the edge names. */
function expectBelow(model: LayoutModel, a: string, b: string): void {
  expect(at(model, b).y, `${b} below ${a}`).toBeGreaterThan(at(model, a).y);
}

/** Each edge leaves and enters by the sides it names: where its line attaches. */
function expectPorts(model: LayoutModel, ports: Readonly<Record<string, object>>): void {
  for (const [id, p] of Object.entries(ports)) expect(model.edges.get(id)?.ports, id).toEqual(p);
}

const codes = (warnings: readonly { code: string }[]) => warnings.map((w) => w.code);

const SIDES = (engine: string): string =>
  `Layout "${engine}" does not place services on the sides their edges name (L, R, T, B); the sides only set where lines attach.`;

describe('architecture is laid out by the engine `layout` names (#673, D560)', () => {
  it('lays out with compass by default, with no warning', async () => {
    const r = await render(CHAINS);
    expect(r.engine).toBe('compass');
    expect(r.warnings).toEqual([]);
    expectChains(r.model);
  });

  it.each([
    ['front matter `layout: layered`', withFrontMatter('layered', CHAINS), {}, 'layered', 'layout'],
    ['front matter `layout: dagre`', withFrontMatter('dagre', CHAINS), {}, 'dagre', 'layout'],
    ['site-wide `layout: dagre`', CHAINS, { layout: 'dagre' }, 'dagre', 'layout'],
    ['site-wide `layout: layered`', CHAINS, { layout: 'layered' }, 'layered', 'layout'],
    [
      '`architecture.layout: layered`',
      CHAINS,
      { architecture: { layout: 'layered' } },
      'layered',
      'architecture.layout',
    ],
  ] as const)('%s: that engine, with one warning', async (_, source, config, engine, path) => {
    const r = await render(source, config as MermaidConfig);
    expect(r.engine).toBe(engine);
    // Ranked down the flow: `a:R --> L:b` puts `b` under `a`, its line on the named sides.
    expectBelow(r.model, 'a', 'b');
    expectBelow(r.model, 'b', 'c');
    expectPorts(r.model, {
      'edge:a->b': { source: 'right', target: 'left' },
      'edge:c->d': { source: 'bottom', target: 'top' },
    });
    expect(codes(r.warnings)).toEqual([ARCHITECTURE_PLACEMENT_IGNORED]);
    const [w] = r.warnings;
    expect(w!.path).toBe(path);
    expect(w!.message).toBe(SIDES(engine));
  });

  it('draws `dagre` as `layered`, only the name in the warning changed', async () => {
    const draw = async (layout: string) => {
      const m = createMermaid();
      m.initialize({ layout });
      return m.render('arch', JUNCTION);
    };
    const [byLayered, byDagre] = [await draw('layered'), await draw('dagre')];
    expect(byDagre.svg).toBe(byLayered.svg);
    expect(byDagre.svg).not.toBe((await createMermaid().render('arch', JUNCTION)).svg);
    expect(byDagre.warnings.map((w) => w.message)).toEqual([SIDES('dagre')]);
    expect(byLayered.warnings.map((w) => w.message)).toEqual([SIDES('layered')]);
  });

  it('draws a junction under `layout: layered`, each line on its named sides', async () => {
    const r = await render(withFrontMatter('layered', JUNCTION));
    expect(r.engine).toBe('layered');
    expectBelow(r.model, 'top', 'j1');
    expectBelow(r.model, 'j1', 'j2');
    expectPorts(r.model, {
      'edge:top->j1': { source: 'bottom', target: 'top' },
      'edge:j1->l': { source: 'left', target: 'right' },
      'edge:j1->r': { source: 'right', target: 'left' },
      'edge:j1->j2': { source: 'bottom', target: 'top' },
    });
    expect(codes(r.warnings)).toEqual([ARCHITECTURE_PLACEMENT_IGNORED]);
  });

  it('draws a group, a `{group}` end and an edge label under `layout: layered`', async () => {
    const r = await render(withFrontMatter('layered', GROUPED));
    expect(r.engine).toBe('layered');
    expect([...r.model.groups.keys()]).toEqual(['api']);
    expect(r.model.edges.size).toBe(3);
    expect(r.svg).toContain('>reads<');
    expect(codes(r.warnings)).toEqual([ARCHITECTURE_PLACEMENT_IGNORED]);
    expect(r.warnings[0]!.message).toBe(
      `${SIDES('layered')} It also ignores \`{group}\` on an edge end (the line meets the service, not the group border).`
    );
  });

  it('takes an explicit `compass` with no warning', async () => {
    const r = await render(withFrontMatter('compass', JUNCTION), { layout: 'dagre' });
    expect(r.engine).toBe('compass');
    expectJunction(r.model);
    expect(r.warnings).toEqual([]);
  });

  it('takes an installed `elk` by name, its ports on the named sides, with no warning', async () => {
    const r = await render(withFrontMatter('elk', CHAINS), {}, true);
    expect(r.engine).toBe('elk');
    expect(codes(r.warnings)).not.toContain(ARCHITECTURE_PLACEMENT_IGNORED);
    const ports = [...r.model.edges.values()].map((e) => e.ports);
    expect(ports).toContainEqual({ source: 'right', target: 'left' });
    expect(ports).toContainEqual({ source: 'bottom', target: 'top' });
  });
});
