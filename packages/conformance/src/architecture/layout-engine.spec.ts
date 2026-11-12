import { describe, expect, it } from 'vitest';
import type { MermaidConfig } from '@mermaid-js/core/config';
import { layered, type LayoutEngine, type LayoutModel } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { ARCHITECTURE_LAYOUT_IGNORED } from '@mermaid-js/diagram-architecture';
import elkLayouts from '@mermaid-js/layout-elk';
import { createMermaid } from 'mermaid';

// The engine an architecture diagram is laid out with (#673, D556), through
// `createMermaid().render()`. `layered` and v12's `dagre` ignore the sides for placement, so
// architecture keeps `compass` for them, from front matter, `initialize()` or the `architecture`
// section, with one ARCHITECTURE_LAYOUT_IGNORED warning; `compass` and an installed ELK stay
// selectable by name (D327, D503). Each engine is registered under its own name with a recorder,
// so the spec sees which one laid the graph out and where it put each node.

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

const codes = (warnings: readonly { code: string }[]) => warnings.map((w) => w.code);

describe('architecture keeps compass for engines that ignore the sides (#673)', () => {
  it('lays out with compass by default, with no warning', async () => {
    const r = await render(CHAINS);
    expect(r.engine).toBe('compass');
    expect(r.warnings).toEqual([]);
    expectChains(r.model);
  });

  it.each([
    ['front matter `layout: layered`', withFrontMatter('layered', CHAINS), {}, 'layout'],
    ['front matter `layout: dagre`', withFrontMatter('dagre', CHAINS), {}, 'layout'],
    ['site-wide `layout: dagre`', CHAINS, { layout: 'dagre' }, 'layout'],
    ['site-wide `layout: layered`', CHAINS, { layout: 'layered' }, 'layout'],
    [
      '`architecture.layout: layered`',
      CHAINS,
      { architecture: { layout: 'layered' } },
      'architecture.layout',
    ],
  ] as const)('%s: compass, with one warning', async (_, source, config, path) => {
    const r = await render(source, config as MermaidConfig);
    expect(r.engine).toBe('compass');
    expectChains(r.model);
    expect(codes(r.warnings)).toEqual([ARCHITECTURE_LAYOUT_IGNORED]);
    const [w] = r.warnings;
    expect(w!.path).toBe(path);
    expect(w!.message).toMatch(/^Ignored layout "(layered|dagre)" for this architecture diagram/);
    expect(w!.message).toContain('laid out with "compass"');
  });

  it('draws the same SVG as the default under `layout: dagre`, warning aside', async () => {
    const plain = await createMermaid().render('arch', JUNCTION);
    const m = createMermaid();
    m.initialize({ layout: 'dagre' });
    const dagre = await m.render('arch', JUNCTION);
    expect(dagre.svg).toBe(plain.svg);
    expect(codes(dagre.warnings)).toEqual([ARCHITECTURE_LAYOUT_IGNORED]);
  });

  it('keeps the junction a cross under `layout: layered`', async () => {
    const r = await render(withFrontMatter('layered', JUNCTION));
    expect(r.engine).toBe('compass');
    expectJunction(r.model);
    expect(codes(r.warnings)).toEqual([ARCHITECTURE_LAYOUT_IGNORED]);
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
    expect(codes(r.warnings)).not.toContain(ARCHITECTURE_LAYOUT_IGNORED);
    const ports = [...r.model.edges.values()].map((e) => e.ports);
    expect(ports).toContainEqual({ source: 'right', target: 'left' });
    expect(ports).toContainEqual({ source: 'bottom', target: 'top' });
  });
});
