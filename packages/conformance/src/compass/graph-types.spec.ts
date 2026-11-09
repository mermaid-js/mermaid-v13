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

/** Puts `layout: compass` in the fixture's front matter, over any `layout` it sets. */
function withCompass(source: string): string {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!fm) return `---\nlayout: compass\n---\n${source}`;
  const body = fm[1]!.replace(/^layout:.*$/m, '').replace(/^(\s+)layout:.*$/m, '');
  return `---\n${body}\nlayout: compass\n---\n${source.slice(fm[0].length)}`;
}

describe.each(TYPES)('compass over parser-produced %s graphs (D327)', (_, dir) => {
  it('renders every fixture with `layout: compass`, unrefused and without NaN', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    let rendered = 0;
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), 'x')) {
      let r;
      try {
        r = await m.render('mermaid-0', withCompass(item.source));
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
