import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { outlineFixture, outliningEveryLeaf } from '@mermaid-js/core/svg/testing';
import { createMermaid, MermaidError, type DiagramPlugin, type ExtensionPlugin } from 'mermaid';
import { createMermaid as createSlim } from 'mermaid/slim';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import { OUTLINE_CASES } from './outline-cases.ts';

/**
 * The outline hook (D302) changes no byte of the corpus unless a drawer draws. The base writes
 * every outline as its plain leaf, as flowchart, class, state and ER did before they adopted
 * the hook (#340), kanban before #459 and venn before #501. The types are `OUTLINE_CASES`, one
 * `src/<type>/outline.ts` each. Against it: the adopted diagrams with no drawer, with T0's fixture drawer registered but inactive (stream and tree backing),
 * and with every leaf of every first-party diagram drawn through `w.outline` and a drawer
 * declining each one.
 */

/** The outlining types (`OUTLINE_CASES`, each type's `src/<type>/outline.ts`). */
const CASES = [...OUTLINE_CASES.values()];
const DIRS = CASES.flatMap((c) => c.dirs);

type AnyPlugin = DiagramPlugin<unknown, unknown>;
const PLUGINS: AnyPlugin[] = CASES.map((c) => c.plugin);

/** `w`, writing each outline as the plain leaf, without the hook. */
const plainLeaves = (w: SvgWriter): SvgWriter => ({
  open: (tag, attrs) => w.open(tag, attrs),
  close: () => w.close(),
  leaf: (tag, attrs) => w.leaf(tag, attrs),
  outline: (_role, tag, attrs) => w.leaf(tag, attrs),
  plainEdge: (attrs) => w.leaf('path', attrs),
  text: (content) => w.text(content),
  label: (box, x, y, attrs) => w.label(box, x, y, attrs),
  path: () => w.path(),
  styleSheet: (css) => w.styleSheet(css),
  linearGradient: (g) => w.linearGradient(g),
  embed: (svg) => w.embed(svg),
});

/** `plugin`, as it drew before adopting the hook. */
const unadopted = (plugin: AnyPlugin): AnyPlugin => ({
  ...plugin,
  render: (model, layout, ctx, w) => plugin.render(model, layout, ctx, plainLeaves(w)),
});

/** `plugin`, drawing every shape through `w.outline`. */
const adopted = (plugin: AnyPlugin): AnyPlugin => ({
  ...plugin,
  render: (model, layout, ctx, w) => plugin.render(model, layout, ctx, outliningEveryLeaf(w)),
});

const inactive: ExtensionPlugin = {
  id: 'fixture-outline',
  outline: { ...outlineFixture, active: () => false },
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
    const slim = () => createSlim({ diagrams: PLUGINS.map(adopted) });
    const plain = await api(() => createSlim({ diagrams: PLUGINS.map(unadopted) }));
    const variants = {
      'adopted, no drawer': await api(full),
      'adopted, inactive fixture drawer, stream': await api(full, inactive),
      'adopted, inactive fixture drawer, tree': await api(full, inactive, tree),
      'every leaf outlined, no drawer': await api(slim),
      'every leaf outlined, declining drawer, stream': await api(slim, declining),
      'every leaf outlined, declining drawer, tree': await api(slim, declining, tree),
    };
    let compared = 0;
    let hops = 0;
    for (const dir of DIRS)
      for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams', dir), dir)) {
        // Line hops (D537) are found at the edge outline, which the plain-leaf base does not
        // draw through: both sides compare a fixture that turns them on with them off, and the
        // adopted diagrams must hop with them on: a plain hop, or one merged over crossings
        // too close for a hop each (D650), which is wider than it is tall.
        const source = item.source.replace(/^(\s*lineHops:) (true|arc|gap)$/m, '$1 false');
        if (source !== item.source) {
          await variants['adopted, no drawer'].prepare(item.source, { id: 'm' });
          const hopped = variants['adopted, no drawer'].renderSync(item.source, { id: 'm' }).svg;
          expect(hopped, `${item.id}: hops`).toMatch(/A[\d.]+,6 [-\d.]+ 0,[01] /);
          hops++;
        }
        let expected: string;
        try {
          await plain.prepare(source, { id: 'm' });
          expected = plain.renderSync(source, { id: 'm' }).svg;
        } catch (e) {
          if (e instanceof MermaidError) continue;
          throw e;
        }
        for (const [name, m] of Object.entries(variants)) {
          await m.prepare(source, { id: 'm' });
          const svg = m.renderSync(source, { id: 'm' }).svg;
          if (svg !== expected) expect(svg, `${item.id}: ${name}`).toBe(expected);
        }
        compared++;
      }
    expect(compared).toBeGreaterThan(1000);
    expect(hops, 'fixtures with line hops on').toBeGreaterThan(0);
  }, 600_000);
});
