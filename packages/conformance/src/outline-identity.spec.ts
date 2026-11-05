import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classDiagram } from '@mermaid-js/diagram-class';
import { er } from '@mermaid-js/diagram-er';
import { flowchart } from '@mermaid-js/diagram-flowchart';
import { sequence } from '@mermaid-js/diagram-sequence';
import { state } from '@mermaid-js/diagram-state';
import { outliningEveryLeaf } from '@mermaid-js/core/svg/testing';
import { createMermaid, MermaidError, type DiagramPlugin, type ExtensionPlugin } from 'mermaid';
import { createMermaid as createSlim } from 'mermaid/slim';
import { REPO_ROOT, corpusFromDir } from './index.ts';

/**
 * The outline hook (D302) changes no byte of the corpus unless a drawer draws: with a drawer
 * registered but inactive, in the stream and the tree backing, and with every first-party
 * diagram drawing all its shapes through `w.outline` and the drawer declining each one.
 */

const DIRS = [
  'flowchart',
  'class-diagram',
  'state-diagram',
  'state-diagram-v2',
  'er-diagram',
  'sequence',
];

type AnyPlugin = DiagramPlugin<unknown, unknown>;

/** `plugin`, drawing every shape through `w.outline`. */
const adopted = (plugin: AnyPlugin): AnyPlugin => ({
  ...plugin,
  render: (model, layout, ctx, w) => plugin.render(model, layout, ctx, outliningEveryLeaf(w)),
});

const inactive: ExtensionPlugin = {
  id: 'inactive',
  outline: { active: () => false, draw: () => true },
};
const declining: ExtensionPlugin = {
  id: 'declining',
  outline: { active: () => true, draw: () => false },
};
/** A no-op `postRender`, so the render writes into the tree backing. */
const tree: ExtensionPlugin = { id: 'tree', postRender: () => {} };

async function api(make: () => ReturnType<typeof createMermaid>, ...extensions: ExtensionPlugin[]) {
  const m = make();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams(extensions);
  return m;
}

describe('the outline hook leaves the corpus byte-identical (D302)', () => {
  it('with no drawer drawing, in both writer backings', async () => {
    const full = () => createMermaid();
    const slim = () =>
      createSlim({
        diagrams: [flowchart, classDiagram, state, er, sequence].map((p) =>
          adopted(p as unknown as AnyPlugin)
        ),
      });
    const plain = await api(full);
    const variants = {
      'inactive drawer, stream': await api(full, inactive),
      'inactive drawer, tree': await api(full, inactive, tree),
      'adopted, no drawer': await api(slim),
      'adopted, declining drawer, stream': await api(slim, declining),
      'adopted, declining drawer, tree': await api(slim, declining, tree),
    };
    let compared = 0;
    for (const dir of DIRS)
      for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), dir)) {
        let expected: string;
        try {
          await plain.prepare(item.source, { id: 'm' });
          expected = plain.renderSync(item.source, { id: 'm' }).svg;
        } catch (e) {
          if (e instanceof MermaidError) continue;
          throw e;
        }
        for (const [name, m] of Object.entries(variants)) {
          await m.prepare(item.source, { id: 'm' });
          const svg = m.renderSync(item.source, { id: 'm' }).svg;
          if (svg !== expected) expect(svg, `${item.id}: ${name}`).toBe(expected);
        }
        compared++;
      }
    expect(compared).toBeGreaterThan(1000);
  }, 600_000);
});
