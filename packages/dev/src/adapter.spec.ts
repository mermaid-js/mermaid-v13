import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderDiagram } from './adapter.ts';
import { galleryFixtures } from './fixtures.ts';

describe('renderDiagram (the page adapter)', () => {
  it.each(galleryFixtures().map((f) => [f.path, f.source]))(
    'renders %s without warnings',
    async (_path, source) => {
      const { svg, warnings } = await renderDiagram(source);
      expect(warnings).toEqual([]);
      expect(svg).toMatch(
        /^<svg [^>]*aria-roledescription="(flowchart|er|sequence|classDiagram|stateDiagram|journey|timeline|pie|quadrantChart|mindmap|gitGraph|gantt|radar)"/
      );
    }
  );

  it('lets the integrator theme apply when the fixture sets none', async () => {
    const text = 'flowchart LR\n  A --> B';
    const light = await renderDiagram(text, { config: { theme: 'default' } });
    const dark = await renderDiagram(text, { config: { theme: 'dark' } });
    expect(light.svg).not.toEqual(dark.svg);
  });

  it('writes literal colours with cssVariables: false', async () => {
    const { svg } = await renderDiagram('flowchart LR\n  A --> B', { cssVariables: false });
    expect(svg).not.toContain('var(--');
  });

  it('lays out ELK names with @mermaid-js/layout-elk, as an installed plugin would (D171)', async () => {
    const text = 'flowchart LR\n  A --> B\n  A --> C\n  B --> D\n  C --> D';
    const elk = await renderDiagram(`---\nconfig:\n  layout: elk\n---\n${text}`);
    expect(elk.warnings).toEqual([]);
    expect(elk.svg).not.toEqual((await renderDiagram(text)).svg);
  });

  // The corpus's icon shapes (I4 #326), with the pages' static packs (`icon-packs.ts`).
  it.each([
    ['pr-check/5-icon-shape-bundled.mmd', 1],
    [
      'visual-check/should-render-single-aws-icon-with-rect-elements-without-unintended-opacity.mmd',
      1,
    ],
    ['visual-check/should-render-multiple-aws-icons-with-rect-elements-in-a-flowchart.mmd', 3],
    ['visual-check/should-render-aws-icons-with-labels-and-rect-elements.mmd', 3],
  ])('draws the glyphs of flowchart/%s with the icons extension', async (path, glyphs) => {
    const source = readFileSync(
      new URL(`../../../e2e/diagrams/flowchart/${path}`, import.meta.url),
      'utf8'
    );
    const { svg, warnings } = await renderDiagram(source);
    expect(warnings).toEqual([]);
    expect(
      svg.match(/<g transform="translate\([^)]*\)"(?: color="[^"]*")?><g transform="/g)
    ).toHaveLength(glyphs);
  });

  // The corpus's mindmap `::icon()` references (#328, D297) and the icon baselines, with the
  // pages' static packs: every icon a glyph, none shown as written, no warning.
  it.each([
    ['nightly-check/all-shapes-with-mdi-fire-icon.mmd', 8],
    ['nightly-check/branches-with-shapes-and-labels.mmd', 2],
    ['nightly-check/bang-and-cloud-shape.mmd', 3],
    ['nightly-check/a-root-with-an-icon.mmd', 1],
    ['pr-check/3-tidy-tree-should-render-a-mindmap-with-different-shapes.mmd', 1],
    ['baseline/icons/default.mmd', 8],
    ['baseline/icons/redux.mmd', 8],
    ['baseline/icons/neo.mmd', 8],
    ['baseline/icons/neo-dark.mmd', 8],
  ])('draws the glyphs of mindmap/%s with the icons extension', async (path, glyphs) => {
    const source = readFileSync(
      new URL(`../../../e2e/diagrams/mindmap/${path}`, import.meta.url),
      'utf8'
    );
    const { svg, warnings } = await renderDiagram(source);
    expect(warnings).toEqual([]);
    expect(svg).not.toMatch(/<text class="mindmap-icon"/);
    expect(
      svg.match(
        /<g class="mindmap-icon" transform="translate\([^)]*\)"><g transform="[^"]*" color="[^"]*">/g
      )
    ).toHaveLength(glyphs);
  });

  it('sketches `look: handDrawn` with @mermaid-js/plugin-hand-drawn, as an installed plugin would (D300)', async () => {
    const text = 'flowchart LR\n  A --> B';
    const sketched = await renderDiagram(`---\nconfig:\n  look: handDrawn\n---\n${text}`);
    expect(sketched.warnings).toEqual([]);
    expect(sketched.svg).not.toMatch(/<rect /);
    expect((await renderDiagram(text)).svg).toMatch(/<rect /);
  });

  it('has a hand-drawn baseline per diagram type the plugin sketches (per shape for mindmap), in each theme family (D307)', () => {
    const handDrawn = galleryFixtures()
      .filter((f) => f.path.split('/')[1] === 'handdrawn')
      .map((f) => [
        f.path,
        /^ {2}theme: (\S+)$/m.exec(f.source)?.[1],
        f.source.includes('look: handDrawn'),
      ]);
    const families = ['default', 'neo-dark', 'neo', 'redux'];
    const each = (prefix: string) =>
      families.map((theme) => [`${prefix}/${theme}.mmd`, theme, true]);
    // Mindmap has one per node shape, plus its edges (H4, #344).
    const mindmap = ['bang', 'circle', 'cloud', 'default', 'edges', 'hexagon', 'rounded', 'square'];
    expect(handDrawn).toEqual([
      ...['class-diagram', 'er-diagram', 'flowchart'].flatMap((f) => each(`${f}/handdrawn`)),
      ...mindmap.flatMap((shape) => each(`mindmap/handdrawn/${shape}`)),
      ...each('state-diagram-v2/handdrawn'),
    ]);
  });
});
