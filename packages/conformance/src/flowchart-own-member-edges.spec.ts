import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  layered,
  validateLayout,
  type LayoutGraph,
  type LayoutModel,
  type LayoutModelNode,
} from '@mermaid-js/core/layout';
import { createMermaid } from 'mermaid';
import { REPO_ROOT } from './index.ts';

// Edges between a subgraph and something nested inside it (#405, #415). The graphs come from the
// `own-member-*` fixtures through the v13 parser and table measurer, captured by a layout engine
// registered with `registerLayoutLoaders`; the drawn paths are the rendered SVG's.
const DIR = join(REPO_ROOT, 'e2e/diagrams/flowchart/baseline/subgraphs');

// A visible arrow: the drawn line, without its arrowhead, at least this long (v12 draws 20 px
// and more for every case of #415).
const MIN_LINE = 20;

interface Rendered {
  graph: LayoutGraph;
  model: LayoutModel;
  svg: string;
}

async function render(source: string): Promise<Rendered> {
  let graph: LayoutGraph | undefined;
  const m = createMermaid();
  m.initialize({ deterministic: true });
  const capture = (g: LayoutGraph): LayoutModel => {
    graph = g;
    return layered(g);
  };
  m.registerLayoutLoaders(
    ['layered', 'dagre'].map((name) => ({ name, loader: () => Promise.resolve(capture) }))
  );
  const { svg } = await m.render('mermaid-0', source);
  if (!graph) throw new Error('no graph captured');
  return { graph, model: layered(graph), svg };
}

// The length of a path's `d`, from command end point to end point (arcs as chords).
function pathLength(d: string): number {
  let len = 0;
  let at: [number, number] | undefined;
  for (const [, op, args] of d.matchAll(/([MLAC])([^MLAC]*)/g)) {
    const n = args!.trim().split(/[ ,]+/).map(Number);
    const to: [number, number] = [n.at(-2)!, n.at(-1)!];
    if (op !== 'M' && at) len += Math.hypot(to[0] - at[0], to[1] - at[1]);
    at = to;
  }
  return len;
}

function edgePath(svg: string, id: string): string {
  const hit = new RegExp(`data-id="${id}"[^>]*>\\s*<path d="([^"]+)"`).exec(svg);
  if (!hit) throw new Error(`no drawn path for edge ${id}`);
  return hit[1]!;
}

const SLACK = 1;
const side = (b: LayoutModelNode) => ({
  x0: b.x - b.width / 2,
  x1: b.x + b.width / 2,
  y0: b.y - b.height / 2,
  y1: b.y + b.height / 2,
});
const onBorder = (b: LayoutModelNode, p: { x: number; y: number }): boolean => {
  const r = side(b);
  const inX = p.x >= r.x0 - SLACK && p.x <= r.x1 + SLACK;
  const inY = p.y >= r.y0 - SLACK && p.y <= r.y1 + SLACK;
  const at = (a: number, c: number) => Math.abs(a - c) <= SLACK;
  return inX && inY && (at(p.x, r.x0) || at(p.x, r.x1) || at(p.y, r.y0) || at(p.y, r.y1));
};
const inside = (b: LayoutModelNode, p: { x: number; y: number }): boolean => {
  const r = side(b);
  return p.x > r.x0 + SLACK && p.x < r.x1 - SLACK && p.y > r.y0 + SLACK && p.y < r.y1 - SLACK;
};

async function fixtures(prefix: string): Promise<[string, string][]> {
  const names = (await readdir(DIR)).filter((f) => f.startsWith(prefix)).sort();
  return Promise.all(
    names.map(async (f) => [f, await readFile(join(DIR, f), 'utf8')] as [string, string])
  );
}

describe('flowchart: edges between a subgraph and its own descendants (#405, #415)', async () => {
  const cases = await fixtures('own-member-');

  it('has the fixtures', () => expect(cases.length).toBeGreaterThanOrEqual(7));

  it.each(cases)('%s draws each such edge as a visible arrow into its member', async (_, src) => {
    const { graph, model, svg } = await render(src);
    expect(validateLayout(graph, model)).toEqual([]);
    const parent = new Map<string, string | undefined>();
    for (const n of graph.nodes) parent.set(n.id, n.parent);
    for (const g of graph.groups) parent.set(g.id, g.parent);
    const within = (id: string, group: string): boolean => {
      for (let p = parent.get(id); p !== undefined; p = parent.get(p)) if (p === group) return true;
      return false;
    };
    const boxOf = (id: string): LayoutModelNode =>
      model.nodes.get(id) ?? (model.groups.get(id) as LayoutModelNode);
    let own = 0;
    for (const e of graph.edges) {
      const fromGroup = within(e.target, e.source);
      if (!fromGroup && !within(e.source, e.target)) continue;
      own++;
      const [group, member] = fromGroup ? [e.source, e.target] : [e.target, e.source];
      const points = model.edges.get(e.id)!.points;
      const groupEnd = fromGroup ? points[0]! : points.at(-1)!;
      const memberEnd = fromGroup ? points.at(-1)! : points[0]!;
      // The line reaches its member's border, and starts (or ends) inside its group clear of
      // every node, not at the middle of either.
      expect(onBorder(boxOf(member), memberEnd), `${e.id} meets ${member}`).toBe(true);
      expect(inside(boxOf(group), groupEnd) || onBorder(boxOf(group), groupEnd)).toBe(true);
      for (const [id, b] of model.nodes)
        expect(inside(b, groupEnd), `${e.id} starts in ${id}`).toBe(false);
      // It passes through no node but its member.
      for (let k = 1; k < points.length; k++) {
        const a = points[k - 1]!;
        const b = points[k]!;
        for (let t = 0; t <= 1; t += 1 / 32) {
          const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          for (const [id, box] of model.nodes)
            if (id !== member) expect(inside(box, p), `${e.id} crosses ${id}`).toBe(false);
        }
      }
      expect(pathLength(edgePath(svg, e.id)), `${e.id} drawn length`).toBeGreaterThanOrEqual(
        MIN_LINE
      );
    }
    expect(own).toBeGreaterThan(0);
  });
});
