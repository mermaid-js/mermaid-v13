import { describe, expect, it } from 'vitest';
import { assertInert, type OutlineRole } from '@mermaid-js/core/svg';
import { outlineFixture } from '@mermaid-js/core/svg/testing';
import { renderBlockForTest } from './harness.ts';

/**
 * The block renderer through the plugin's seam (`renderBlockForTest`: parse → layout → render):
 * v12's structure and class names, the composite palette, styles, the families' gradient and
 * shadow, and what the hand-drawn hook sketches (spec #521 T4, D227, D446, D447, D448).
 */
const render = (src: string, config: Record<string, unknown> = {}) =>
  renderBlockForTest(src, { config });

/** The opening tags of `svg`, in order. */
const tags = (svg: string): string[] => svg.match(/<[a-z][^>]*>/g) ?? [];
const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const nodes = (svg: string): string[] => tags(svg).filter((t) => t.startsWith('<g class="node '));

describe('block SVG structure (v12 class names)', () => {
  it('draws one g.node per block in pre-order inside g.block, spaces drawing nothing', async () => {
    const { svg } = await render(
      'block\n  columns 3\n  a space b\n  block:g\n    c\n    block:h\n      d\n    end\n  end\n'
    );
    expect(svg).toMatch(
      /^<svg [^>]*class="mermaid mermaid-block"[^>]*aria-roledescription="block"/
    );
    expect(svg).toContain('<g class="block">');
    expect(nodes(svg).map((t) => attr(t, 'data-id'))).toEqual(['a', 'b', 'g', 'c', 'h', 'd']);
    expect(nodes(svg).map((t) => attr(t, 'data-ast'))).toEqual(
      ['a', 'b', 'g', 'c', 'h', 'd'].map((id) => `block:${id}`)
    );
    expect(nodes(svg).every((t) => attr(t, 'class') === 'node default flowchart-label')).toBe(true);
    // The composites' rects, and the leaves' shapes as label-container.
    expect(svg.match(/<rect class="basic cluster composite label-container"/g)).toHaveLength(2);
    expect(svg.match(/<rect class="label-container"/g)).toHaveLength(4);
    expect(svg.match(/<g class="label" data-id="[a-z]">/g)).toHaveLength(4);
    expect(svg).not.toMatch(/<(style|marker|filter|foreignObject)\b/);
    expect(svg).not.toMatch(/\sid="/);
  });

  it('puts the classes on the group, each class statement split into names', async () => {
    const { svg } = await render(
      'block\n  a b\n  classDef x fill:#f00\n  class a x\n  class b x y\n'
    );
    expect(nodes(svg).map((t) => attr(t, 'class'))).toEqual([
      'node x flowchart-label',
      'node x y flowchart-label',
    ]);
  });

  it('draws every leaf shape from its outline, with its inner lines', async () => {
    const { svg, layout } = await render(
      'block\n  columns 4\n  a["sq"] b("rd") c(["st"]) d[["sub"]] e[("cyl")] f(("ci")) g((("dbl"))) h{"di"}\n' +
        '  i{{"hx"}} j>"od"] k[/"lr"/] l[\\"ll"\\] m[/"tr"\\] n[\\"it"/]\n'
    );
    const shapes = tags(svg)
      .filter((t) => t.includes('class="label-container"'))
      .map((t) => /^<([a-z]+)/.exec(t)![1]);
    expect(shapes).toEqual([
      ...['rect', 'rect', 'rect', 'rect', 'path', 'circle', 'circle', 'polygon'],
      ...['polygon', 'polygon', 'polygon', 'polygon', 'polygon', 'polygon'],
    ]);
    // Round's radius, stadium's half height.
    const rects = tags(svg).filter((t) => t.startsWith('<rect class="label-container"'));
    expect(attr(rects[1]!, 'rx')).toBe('5');
    expect(Number(attr(rects[2]!, 'rx'))).toBeCloseTo(Number(attr(rects[2]!, 'height')) / 2, 1);
    // The subroutine's frames, the cylinder's rim and the double circle's inner ring.
    const inner = tags(svg).filter((t) => /^<(path|circle) (d|r)=/.test(t));
    expect(inner).toHaveLength(3);
    // A polygon's points are its outline's, in the block's frame.
    const diamond = layout.blocks.find((b) => b.id === 'h')!;
    const points = attr(tags(svg).find((t) => t.startsWith('<polygon'))!, 'points');
    expect(diamond.outline?.kind).toBe('polygon');
    if (diamond.outline?.kind === 'polygon')
      expect(points).toBe(
        diamond.outline.points.map((p) => `${+p.x.toFixed(2)},${+p.y.toFixed(2)}`).join(' ')
      );
  });

  it('draws a block arrow as its polygon, for each direction set', async () => {
    const { svg, layout } = await render(
      'block\n  columns 3\n  a<["r"]>(right) b<["l"]>(left) c<["ud"]>(up, down)\n  d<["x"]>(x) e<["y"]>(y) f<["all"]>(right, left, up, down)\n'
    );
    const polygons = tags(svg).filter((t) =>
      t.startsWith('<polygon class="label-container block-arrow"')
    );
    expect(polygons).toHaveLength(6);
    for (const [i, b] of layout.blocks.entries()) {
      expect(b.outline?.kind).toBe('polygon');
      if (b.outline?.kind !== 'polygon') continue;
      expect(attr(polygons[i]!, 'points')).toBe(
        b.outline.points.map((p) => `${+p.x.toFixed(2)},${+p.y.toFixed(2)}`).join(' ')
      );
    }
  });

  it('draws edges after every block, with their classes, data-ast and inline arrowheads', async () => {
    const { svg } = await render(
      'block\n  columns 4\n  a b c d\n  a --> b\n  b == "lbl" ==> c\n  c -.- d\n  a --x d\n  b --o d\n'
    );
    const all = tags(svg);
    const firstEdge = all.findIndex((t) => t.includes('flowchart-link'));
    const lastNode =
      all.length - 1 - [...all].reverse().findIndex((t) => t.startsWith('<g class="node '));
    expect(firstEdge).toBeGreaterThan(lastNode);
    const edges = all.filter((t) => t.includes('flowchart-link'));
    expect(edges.map((t) => [attr(t, 'class'), attr(t, 'data-ast')])).toEqual([
      ['edge-thickness-normal edge-pattern-solid flowchart-link', 'edge:a-&gt;b'],
      ['edge-thickness-thick edge-pattern-solid flowchart-link', 'edge:b-&gt;c'],
      ['edge-thickness-normal edge-pattern-dotted flowchart-link', 'edge:c-&gt;d'],
      ['edge-thickness-normal edge-pattern-solid flowchart-link', 'edge:a-&gt;d'],
      ['edge-thickness-normal edge-pattern-solid flowchart-link', 'edge:b-&gt;d'],
    ]);
    expect(attr(edges[1]!, 'stroke-width')).toBe('3.5');
    expect(attr(edges[2]!, 'stroke-dasharray')).toBe('2');
    // Point heads at the two arrow ends, a cross, a circle, none on the open link.
    expect(svg.match(/<path class="marker" d="[^"]*Z"/g)).toHaveLength(2);
    expect(svg.match(/<path class="marker" d="[^"Z]*"/g)).toHaveLength(1);
    expect(svg.match(/<circle class="marker"/g)).toHaveLength(1);
    // The label: g.edgeLabel with data-id only, on edgeLabelBackground, after the edges.
    expect(svg).toMatch(
      /<g class="edgeLabel" data-id="1-b-c"><rect [^>]*fill="var\(--_el\)"\/><text [^>]*>lbl<\/text><\/g>/
    );
    expect(svg.match(/data-ast=/g)).toHaveLength(4 + 5);
  });

  it('draws a self-loop as a cubic from the outline back to it', async () => {
    const { svg } = await render('block\n  a\n  a --> a\n');
    const edge = tags(svg).find((t) => t.includes('flowchart-link'))!;
    expect(attr(edge, 'd')).toMatch(/^M[-\d.]+,[-\d.]+C[-\d., ]+$/);
  });

  it('sets the viewBox to the layout bounds, and width by useMaxWidth', async () => {
    const r = await render('block\n  a b\n');
    const { x, y, width, height } = r.layout.bounds;
    const root = tags(r.svg)[0]!;
    expect(attr(root, 'viewBox')).toBe(
      [x, y, Math.ceil(width), Math.ceil(height)].map((n) => +n.toFixed(2)).join(' ')
    );
    expect(attr(root, 'width')).toBe('100%');
    const fixed = await render(
      '---\nconfig:\n  block:\n    useMaxWidth: false\n---\nblock\n  a b\n'
    );
    expect(attr(tags(fixed.svg)[0]!, 'width')).toBe(String(Math.ceil(width)));
  });

  it('writes inert SVG for hostile labels and styles', async () => {
    const r = await render(
      'block\n  a["<script>alert(1)</script>"]\n  style a fill:url(javascript:alert(1)),stroke:#0f0\n'
    );
    expect(() =>
      assertInert(r.svg, { gradient: r.gradient, themeStyle: r.themeStyle })
    ).not.toThrow();
    expect(r.svg).not.toMatch(/<script|javascript/);
    expect(r.warnings.map((w) => w.code)).toContain('STYLE_VALUE_DROPPED');
  });
});

describe('block styles (classDef, class, style)', () => {
  it('sends a style and a class to the shape, and a class color to the label', async () => {
    const { svg } = await render(
      'block\n  a b\n  classDef hot fill:#f00,color:#fff,stroke-width:4px\n  class a hot\n  style b stroke:#00f\n',
      { theme: 'default' }
    );
    const [a, b] = tags(svg).filter((t) => t.startsWith('<rect class="label-container"'));
    expect([attr(a!, 'fill'), attr(a!, 'stroke-width')]).toEqual(['#f00', '4px']);
    expect(attr(b!, 'stroke')).toBe('#00f');
    const texts = tags(svg).filter((t) => t.startsWith('<text'));
    expect(attr(texts[0]!, 'fill')).toBe('#fff');
    expect(attr(texts[1]!, 'fill')).toBe('var(--_nt)');
  });

  it("gives a filled shape's label the ink of its fill", async () => {
    const { svg } = await render('block\n  a\n  style a fill:#000\n', { theme: 'default' });
    const text = tags(svg).find((t) => t.startsWith('<text'))!;
    expect(attr(text, 'fill')).not.toBe('var(--_nt)');
  });
});

// v12's `blockColorIndex.spec.ts` stylesheet cases, as v13 draws them: no stylesheet, the slot
// is on the composite itself (its `data-color-id`, stroke and fill).
describe('the composite palette (v12 blockColorIndex stylesheet cases)', () => {
  const src =
    'block\n  block:a1\n    x\n  end\n  block:a2\n    y\n  end\n  block:a3\n    z\n  end\n  w\n';
  const palette = {
    borderColorArray: ['#111111', '#222222'],
    bkgColorArray: ['#eeeeee', '#dddddd'],
  };

  it('stamps one slot per composite, modulo the palette, with its border and fill', async () => {
    const { svg } = await render(src, { themeVariables: palette });
    const composites = nodes(svg).filter((t) => attr(t, 'data-color-id') !== undefined);
    expect(composites.map((t) => [attr(t, 'data-id'), attr(t, 'data-color-id')])).toEqual([
      ['a1', 'color-0'],
      ['a2', 'color-1'],
      ['a3', 'color-0'],
    ]);
    const rects = tags(svg).filter((t) => t.includes('composite label-container'));
    expect(rects.map((t) => [attr(t, 'stroke'), attr(t, 'fill')])).toEqual([
      ['#111111', '#eeeeee'],
      ['#222222', '#dddddd'],
      ['#111111', '#eeeeee'],
    ]);
  });

  it('leaves the simple shapes to the flat theme colour', async () => {
    const { svg } = await render(src, { themeVariables: palette });
    const leaves = nodes(svg).filter((t) => ['x', 'y', 'z', 'w'].includes(attr(t, 'data-id')!));
    expect(leaves.map((t) => attr(t, 'data-color-id'))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    for (const rect of tags(svg).filter((t) => t.startsWith('<rect class="label-container"')))
      expect(attr(rect, 'fill')).toBe('var(--_mb)');
  });

  it('stamps nothing for a theme that carries no palette', async () => {
    expect((await render(src, { theme: 'default' })).svg).not.toContain('data-color-id');
    // The redux colour themes carry one: it is on there, by the variable, not the name.
    expect((await render(src, { theme: 'redux-color' })).svg).toContain('data-color-id="color-0"');
  });

  it('ignores look, so it cannot break out of anything', async () => {
    const looked = await render(`---\nconfig:\n  look: 'neo"] { fill: red } [x="'\n---\n${src}`, {
      themeVariables: palette,
    });
    expect(looked.svg).not.toContain('fill: red');
    expect(looked.svg).not.toContain('data-look');
    expect(looked.svg).toBe((await render(src, { themeVariables: palette })).svg);
  });

  it("lets a block's style beat the palette", async () => {
    const { svg } = await render(`${src}  style a2 stroke:#0f0,fill:#ff0\n`, {
      themeVariables: palette,
    });
    const rects = tags(svg).filter((t) => t.includes('composite label-container'));
    expect([attr(rects[1]!, 'stroke'), attr(rects[1]!, 'fill')]).toEqual(['#0f0', '#ff0']);
  });

  it('colours borders only where bkgColorArray is empty (redux-dark-color)', async () => {
    const { svg } = await render(src, { theme: 'redux-dark-color' });
    const rect = tags(svg).find((t) => t.includes('composite label-container'))!;
    expect(attr(rect, 'stroke')).toMatch(/^#|^rgb/);
    expect(attr(rect, 'fill')).toBe('var(--_mb)');
  });
});

describe('the families (D182, D227)', () => {
  const src = 'block\n  a block:g\n    b<["x"]>(right)\n  end\n  a --> g\n';

  it('puts the gradient and drop shadow on every outline in neo, not on edges', async () => {
    const r = await render(src, { theme: 'neo' });
    expect(r.gradient).not.toBe(false);
    const shapes = tags(r.svg).filter((t) => t.includes('label-container'));
    expect(shapes).toHaveLength(3);
    for (const t of shapes) {
      expect(attr(t, 'stroke'), t).toBe(`url(#${r.gradient})`);
      expect(attr(t, 'filter'), t).toBeDefined();
    }
    const edge = tags(r.svg).find((t) => t.includes('flowchart-link'))!;
    expect(attr(edge, 'stroke')).not.toContain('url(');
    expect(attr(edge, 'filter')).toBeUndefined();
  });

  it('draws neither in the classic themes', async () => {
    const r = await render(src, { theme: 'default' });
    expect(r.gradient).toBe(false);
    expect(r.svg).not.toMatch(/url\(|filter=/);
  });
});

describe('hand-drawn (D447)', () => {
  it('sends only the leaves through the outline hook', async () => {
    const roles: [OutlineRole, string][] = [];
    const r = await renderBlockForTest(
      'block\n  a[["sub"]] b((("dbl"))) c[("cyl")]\n  block:g\n    d<["x"]>(right)\n  end\n  a --> b\n',
      {
        outline: (role, tag, attrs, sink) => {
          roles.push([role, tag]);
          return outlineFixture.draw(role, tag, attrs, sink);
        },
      }
    );
    expect(roles).toEqual([
      ['node', 'rect'],
      ['divider', 'path'],
      ['node', 'circle'],
      ['divider', 'circle'],
      ['node', 'path'],
      ['divider', 'path'],
    ]);
    // The composite, the block arrow and the edge stay plain.
    expect(r.svg).toContain('<rect class="basic cluster composite label-container"');
    expect(r.svg).toContain('<polygon class="label-container block-arrow"');
    expect(r.svg).toMatch(/<path class="edge-thickness-normal/);
  });
});
