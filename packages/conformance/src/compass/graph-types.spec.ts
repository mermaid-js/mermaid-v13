// `compass` on other graph types (D327, D502, R-LAYOUT-9): the e2e flowchart, class, state and
// ER fixtures, parsed and measured by their own packages, with `layout: compass`. Through
// `createMermaid().render()` no fixture is refused or warned off `compass`, and none draws NaN.
// The LayoutGraphs are captured through a loader registered under every layout name, so front
// matter that names another engine is laid out by `compass` too, and each model must be valid:
// no NaN, no overlaps, containment, labels clear (`validateLayout`).
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLayout, type LayoutGraph } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { createMermaid, MermaidError } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from '../index.ts';

const TYPES = [
  ['flowchart', 'e2e/diagrams/flowchart'],
  ['class', 'e2e/diagrams/class-diagram'],
  ['state', 'e2e/diagrams/state-diagram'],
  ['state-v2', 'e2e/diagrams/state-diagram-v2'],
  ['er', 'e2e/diagrams/er-diagram'],
] as const;

const NAMES = ['layered', 'dagre', 'elk', 'elk.layered', 'elk.box', 'elk.rectpacking', 'compass'];

/**
 * Drops any `layout` the fixture's front matter or directives set, so the `layout: compass` that
 * `initialize` sets applies.
 */
function withoutLayout(source: string): string {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(source);
  const rest = (fm ? source.slice(fm[0].length) : source).replace(
    /"layout"\s*:\s*"[^"]*"\s*,?/g,
    ''
  );
  if (!fm) return rest;
  return `---\n${fm[1]!.replace(/^\s*layout:.*$/gm, '')}\n---\n${rest}`;
}

describe.each(TYPES)('compass over parser-produced %s graphs (D327)', (_, dir) => {
  it('renders every fixture with `layout: compass`, unrefused and without NaN', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true, layout: 'compass' });
    let rendered = 0;
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), 'x')) {
      let r;
      try {
        r = await m.render('mermaid-0', withoutLayout(item.source));
      } catch (e) {
        if (e instanceof MermaidError && e.code !== 'INTERNAL') continue;
        throw e;
      }
      rendered++;
      const codes = r.warnings.map((w) => w.code);
      expect(codes, item.id).not.toContain('LAYOUT_UNKNOWN');
      expect(r.svg, item.id).not.toMatch(/NaN|Infinity/);
    }
    expect(rendered).toBeGreaterThan(10);
  }, 300_000);

  it('lays every captured graph out validly', async () => {
    const seen = new Map<'graph', LayoutGraph>();
    const m = createMermaid();
    m.initialize({ deterministic: true, layout: 'compass' });
    const capture = (graph: LayoutGraph) => {
      seen.set('graph', graph);
      return compass(graph);
    };
    m.registerLayoutLoaders(
      NAMES.map((name) => ({ name, loader: () => Promise.resolve(capture) }))
    );
    let checked = 0;
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), 'x')) {
      seen.clear();
      try {
        await m.render('mermaid-0', item.source);
      } catch (e) {
        if (e instanceof MermaidError && e.code !== 'INTERNAL') continue;
        throw e;
      }
      const graph = seen.get('graph');
      // A fixture of another type in the folder (an `info` diagram) has no graph.
      if (!graph) continue;
      expect(validateLayout(graph, compass(graph)), item.id).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  }, 300_000);
});

describe('compass on an edge to a subgraph (finding 5)', () => {
  it('widens the gap for a labelled edge to a group, clear of its border and title', async () => {
    const seen = new Map<'graph', LayoutGraph>();
    const m = createMermaid();
    m.initialize({ deterministic: true, layout: 'compass' });
    m.registerLayoutLoaders([
      {
        name: 'compass',
        loader: () =>
          Promise.resolve((graph: LayoutGraph) => {
            seen.set('graph', graph);
            return compass(graph);
          }),
      },
    ]);
    for (const dir of ['LR', 'TB']) {
      seen.clear();
      await m.render(
        'mermaid-0',
        `flowchart ${dir}\n  A -- a rather long edge label here --> S\n  subgraph S [Subgraph title]\n    B\n  end\n`
      );
      const graph = seen.get('graph')!;
      const model = compass(graph);
      expect(validateLayout(graph, model), dir).toEqual([]);
      const e = graph.edges.find((x) => x.label)!;
      const at = model.edges.get(e.id)!.label!;
      const group = model.groups.get(e.target) ?? model.groups.get(e.source)!;
      const l = e.label!;
      const a = model.nodes.get('A')!;
      // In the gap between A and the subgraph, not dodged off past either.
      const between =
        dir === 'LR'
          ? at.x - l.width / 2 >= a.x + a.width / 2 &&
            at.x + l.width / 2 <= group.x - group.width / 2
          : at.y - l.height / 2 >= a.y + a.height / 2 &&
            at.y + l.height / 2 <= group.y - group.height / 2;
      expect(between, dir).toBe(true);
    }
  });
});
