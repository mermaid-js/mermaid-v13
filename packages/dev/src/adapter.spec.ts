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
        /^<svg [^>]*aria-roledescription="(flowchart|er|sequence|classDiagram|stateDiagram)"/
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
});
