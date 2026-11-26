import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  validateLayout,
  type LayoutContext,
  type LayoutGraph,
  type LayoutModel,
  type Point,
  type Side,
} from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';

// T0c #592 (D327, D503): architecture with `layout: elk` meets each service on the side its
// edge names, through `createMermaid().render()` with the ELK package registered.

const SOURCE = `---
config:
  layout: elk
---
architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service server(server)[Server] in api
    service web(internet)[Web]

    db:L -- R:server
    disk1:T -- B:server
    web:B -- T:db
    server:L --> R:web
`;

function onSide(n: { x: number; y: number; width: number; height: number }, side: Side, p: Point) {
  const [x0, x1, y0, y1] = [
    n.x - n.width / 2,
    n.x + n.width / 2,
    n.y - n.height / 2,
    n.y + n.height / 2,
  ];
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;
  if (side === 'top' || side === 'bottom')
    return near(p.y, side === 'top' ? y0 : y1) && p.x > x0 && p.x < x1;
  return near(p.x, side === 'left' ? x0 : x1) && p.y > y0 && p.y < y1;
}

interface Laid {
  name: string;
  graph: LayoutGraph;
  model: LayoutModel;
}

async function render(source: string, laid: Laid[]): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  m.registerLayoutLoaders(
    elkLayouts.map((l) => ({
      ...l,
      loader: async () => {
        const engine = await l.loader();
        return (graph: LayoutGraph, ctx?: LayoutContext) => {
          const model = engine(graph, ctx);
          laid.push({ name: l.name, graph, model });
          return model;
        };
      },
    }))
  );
  return (await m.render('d', source)).svg;
}

/** How many edge ends meet `side` of node `id`. */
function sharing(graph: LayoutGraph, model: LayoutModel, id: string, side: Side): number {
  let k = 0;
  for (const e of graph.edges) {
    const ports = model.edges.get(e.id)!.ports;
    if (e.source === id && ports.source === side) k++;
    if (e.target === id && ports.target === side) k++;
  }
  return k;
}

/** Every named end of every edge ELK laid out sits on its side, L/R ends about the icon line. */
function expectSides({ graph, model }: Laid): void {
  // ELK, like `layered`, does not read `border` (only `compass` does): those ends stay on the node.
  const grouped = new Set(
    graph.edges
      .filter((e) => e.border?.source === true || e.border?.target === true)
      .map((e) => e.id)
  );
  const issues = validateLayout(graph, model).filter(
    (m) => ![...grouped].some((id) => m.startsWith(`edge '${id}' does not`))
  );
  expect(issues).toEqual([]);
  for (const e of graph.edges) {
    const pts = model.edges.get(e.id)!.points;
    for (const [end, p] of [
      ['source', pts[0]!],
      ['target', pts.at(-1)!],
    ] as const) {
      const side = e.sides?.[end];
      if (!side) continue;
      const box = model.nodes.get(e[end]) ?? model.groups.get(e[end])!;
      expect(model.edges.get(e.id)!.ports[end], `${e.id} ${end}`).toBe(side);
      expect(onSide(box, side, p), `${e.id} ${end}`).toBe(true);
      const anchorY = graph.nodes.find((n) => n.id === e[end])?.anchorY;
      if ((side === 'left' || side === 'right') && anchorY !== undefined) {
        // Alone on its side, on the icon line; else spread about it, `spacing.edge` apart at most.
        const k = sharing(graph, model, e[end], side);
        const dy = Math.abs(p.y - (box.y - box.height / 2 + anchorY));
        if (k === 1) expect(dy, `${e.id} ${end}`).toBeLessThan(0.005);
        else expect(dy, `${e.id} ${end}`).toBeLessThanOrEqual(graph.spacing.edge * (k - 1));
      }
    }
  }
}

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.mmd') ? [p] : [];
  });
const FIXTURES = walk(join(REPO, 'e2e/diagrams/architecture'))
  .map((f) => f.slice(REPO.length))
  .sort();

/** `text` with `layout: elk` in its front matter's config, in place of any `layout` it sets. */
function withElk(source: string): string {
  // Blank, `%%` comment and whole directive lines may come before the front matter (D704): the
  // lines core skips stay first. With no front matter, a new one goes at the very start.
  const at = preprocess(source).frontMatter?.range.start ?? 0;
  return source.slice(0, at) + withElkConfig(source.slice(at));
}

function withElkConfig(text: string): string {
  if (!text.startsWith('---\n')) return `---\nconfig:\n  layout: elk\n---\n${text}`;
  const end = text.indexOf('\n---', 3);
  const own = /^ {2}layout:.*$/m.exec(text.slice(0, end));
  if (own)
    return `${text.slice(0, own.index)}  layout: elk${text.slice(own.index + own[0].length)}`;
  const config = text.slice(0, end).search(/^config:\n/m);
  return config < 0
    ? `---\nconfig:\n  layout: elk\n${text.slice(4)}`
    : `${text.slice(0, config)}config:\n  layout: elk\n${text.slice(config + 8)}`;
}

describe('architecture under layout: elk', () => {
  it('meets every service on the side its edge names', async () => {
    const laid: Laid[] = [];
    expect(await render(SOURCE, laid)).toContain('<svg');
    expect(laid.map((l) => l.name)).toEqual(['elk']);
    const { graph } = laid[0]!;
    expect(graph.edges).toHaveLength(4);
    for (const e of graph.edges) expect(e.sides?.source && e.sides.target, e.id).toBeTruthy();
    expectSides(laid[0]!);
  });

  it.each(FIXTURES)('%s', async (file) => {
    const text = readFileSync(join(REPO, file), 'utf8');
    const laid: Laid[] = [];
    // Each fixture with ELK laid out instead of `compass`.
    await render(withElk(text), laid);
    expect(laid.length).toBeGreaterThan(0);
    for (const l of laid) expectSides(l);
  });
});
