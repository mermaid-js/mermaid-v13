import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, type InitializeConfig, type RenderResult } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

/**
 * Flowchart rendering behaviour through the public `render()` (spec #1 primary seam): the
 * returned SVG is parsed and queried.
 */
async function draw(
  text: string,
  options: { config?: InitializeConfig; idPrefix?: string } = {}
): Promise<RenderResult & { tree: SvgView }> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...options.config });
  const result = await m.render(options.idPrefix ?? 'mermaid-0', text);
  return { ...result, tree: parseSvg(result.svg) };
}

const byAst = (tree: SvgView, id: string): SvgElement[] =>
  tree.find((n, t) => t.getAttr(n, 'data-ast') === id);
const textIn = (tree: SvgView, node: SvgElement): string =>
  tree
    .children(node)
    .map((c) => tree.textOf(c) ?? textIn(tree, c))
    .join('');

describe('flowchart render: document root (DESIGN §7.2)', () => {
  it('writes the root with viewBox, max-width, role and the v12 group classes', async () => {
    const { svg, tree } = await draw('flowchart TD\n  A[Start] --> B(End)');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(tree.getAttr(root, 'role')).toBe('img');
    expect(tree.getAttr(root, 'aria-roledescription')).toBe('flowchart');
    expect(tree.getAttr(root, 'class')).toBe('mermaid mermaid-flowchart');
    expect(tree.getAttr(root, 'data-mermaid-version')).toBe('13.0.0-alpha.0');
    expect(tree.getAttr(root, 'width')).toBe('100%');
    expect(tree.getAttr(root, 'viewBox')).toMatch(/^0 0 \d+ \d+$/);
    expect(tree.getAttr(root, 'style')).toMatch(/^max-width:\d+px;--_/);
    const groups = tree.children(root).map((n) => tree.getAttr(n, 'class'));
    expect(groups).toEqual(['edgePaths', 'edgeLabels', 'nodes']);
  });

  it('writes width and height instead of max-width when useMaxWidth is off', async () => {
    const { tree } = await draw('flowchart TD\n  A --> B', {
      config: { flowchart: { useMaxWidth: false } },
    });
    const root = tree.find({ tag: 'svg' })[0]!;
    const [, , w, h] = tree.getAttr(root, 'viewBox')!.split(' ');
    expect(tree.getAttr(root, 'width')).toBe(w);
    expect(tree.getAttr(root, 'height')).toBe(h);
    expect(tree.getAttr(root, 'style')).not.toMatch(/max-width/);
  });

  it('labels the root from accTitle and accDescr with prefixed ids', async () => {
    const { tree } = await draw(
      'flowchart LR\n  accTitle: Big flow\n  accDescr: How it goes\n  A --> B',
      { idPrefix: 'd1' }
    );
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(tree.getAttr(root, 'aria-labelledby')).toBe('d1-title');
    expect(tree.getAttr(root, 'aria-describedby')).toBe('d1-desc');
    expect(textIn(tree, tree.find({ tag: 'title' })[0]!)).toBe('Big flow');
    expect(tree.getAttr(tree.find({ tag: 'title' })[0]!, 'id')).toBe('d1-title');
    expect(textIn(tree, tree.find({ tag: 'desc' })[0]!)).toBe('How it goes');
  });

  it('declares every theme alias the body uses on the root', async () => {
    const { svg } = await draw(
      'flowchart TD\n  subgraph S[Group]\n    A -- yes --> B{ok?}\n  end\n  B --> C[(db)]'
    );
    const style = /<svg[^>]* style="([^"]*)"/.exec(svg)![1]!;
    const declared = new Set([...style.matchAll(/(--_[\w-]+):/g)].map((m) => m[1]));
    const used = new Set([...svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]));
    for (const name of used) expect(declared, name).toContain(name);
  });
});

describe('flowchart render: themes (D151)', () => {
  const text = 'flowchart TD\n  subgraph S[Group]\n    A --> B\n  end';
  const literal = (theme?: string) =>
    draw(text, {
      config: { output: { cssVariables: false }, ...(theme && { theme }) } as InitializeConfig,
    });
  const strokes = (r: { tree: SvgView }) =>
    new Set(r.tree.find({ tag: 'rect' }).map((n) => r.tree.getAttr(n, 'stroke')));

  it('renders in redux-color when no theme is set, with no warning', async () => {
    const plain = await literal();
    expect(plain.warnings).toEqual([]);
    expect(strokes(plain)).toContain('#28253d');
    // Same output as asking for redux-color by name.
    expect(plain.svg).toBe((await literal('redux-color')).svg);
  });

  it.each(['redux-dark', 'redux-dark-color'])(
    'renders %s as its own theme, with no warning',
    async (theme) => {
      const r = await literal(theme);
      expect(r.warnings).toEqual([]);
      expect(strokes(r)).toContain('#ffffff');
      expect(r.svg).not.toBe((await literal('dark')).svg);
    }
  );

  it.each([
    ['neo', 'redux-color'],
    ['neo-dark', 'redux-dark-color'],
  ])('renders %s as %s, with THEME_UNAVAILABLE', async (theme, standIn) => {
    const r = await literal(theme);
    expect(r.warnings.map((w) => w.code)).toEqual(['THEME_UNAVAILABLE']);
    expect(r.svg).toBe((await literal(standIn)).svg);
  });
});

describe('flowchart render: nodes, edges and clusters', () => {
  it('writes one data-ast element per vertex, edge and subgraph, with v12 classes', async () => {
    const { tree } = await draw(
      'flowchart TD\n  subgraph one[One]\n    A:::hot --> B\n  end\n  classDef hot fill:#f00'
    );
    const node = byAst(tree, 'n:A');
    expect(node).toHaveLength(1);
    expect(tree.getAttr(node[0]!, 'class')).toBe('node default hot');
    expect(tree.getAttr(node[0]!, 'data-id')).toBe('A');
    const edge = byAst(tree, 'e:A>B');
    expect(edge).toHaveLength(1);
    expect(tree.getAttr(edge[0]!, 'class')).toContain('edge');
    expect(tree.getAttr(edge[0]!, 'data-id')).toBe('L_A_B_0');
    const cluster = byAst(tree, 's:one');
    expect(tree.getAttr(cluster[0]!, 'class')).toBe('cluster');
  });

  it('draws arrowheads as inline paths, with no defs or markers', async () => {
    const { svg, tree } = await draw('flowchart LR\n  A --> B\n  C --o D\n  E --x F');
    expect(svg).not.toMatch(/<defs|<marker|marker-end/);
    for (const ast of ['e:A>B', 'e:C>D', 'e:E>F']) {
      const edge = byAst(tree, ast)[0]!;
      expect(tree.children(edge).length, ast).toBe(2);
    }
  });

  it('applies classDef and style through the allow-list, with ink that reads on the fill', async () => {
    const { tree, warnings } = await draw(
      'flowchart TD\n  A[x]\n  style A fill:#000000,stroke:#ff0000,cursor:pointer'
    );
    const node = byAst(tree, 'n:A')[0]!;
    const [shape, text] = tree.children(node);
    expect(tree.getAttr(shape!, 'fill')).toBe('#000000');
    expect(tree.getAttr(shape!, 'stroke')).toBe('#ff0000');
    expect(tree.getAttr(text!, 'fill')).toBe('#ffffff');
    expect(warnings.map((w) => w.code)).toContain('STYLE_PROPERTY_DROPPED');
  });

  it('wraps a node with click href in a link and its tooltip in a title', async () => {
    const { tree } = await draw(
      'flowchart TD\n  A --> B\n  click A "https://example.com" "Go there" _blank'
    );
    const node = byAst(tree, 'n:A')[0]!;
    const [title, link] = tree.children(node);
    expect(tree.tag(title!)).toBe('title');
    expect(textIn(tree, title!)).toBe('Go there');
    expect(tree.tag(link!)).toBe('a');
    expect(tree.getAttr(link!, 'href')).toBe('https://example.com');
    expect(tree.getAttr(link!, 'rel')).toBe('noopener noreferrer');
  });

  it('keeps only relative links under securityLevel strict', async () => {
    const { tree, warnings } = await draw(
      'flowchart TD\n  A --> B\n  click A "/docs/a"\n  click B "https://example.com"',
      { config: { securityLevel: 'strict' } }
    );
    const links = tree.find({ tag: 'a' });
    expect(links.map((a) => tree.getAttr(a, 'href'))).toEqual(['/docs/a']);
    expect(warnings.map((w) => w.code)).toContain('URL_REFUSED');
  });

  it('drops a refused link with a warning and still draws the node', async () => {
    const { tree, warnings } = await draw(
      'flowchart TD\n  A --> B\n  click A "javascript:alert(1)"'
    );
    expect(tree.find({ tag: 'a' })).toHaveLength(0);
    expect(byAst(tree, 'n:A')).toHaveLength(1);
    expect(warnings.map((w) => w.code)).toContain('URL_REFUSED');
  });
});

describe('flowchart render: features', () => {
  it('writes the theme: auto style sheet as the first child, scoped by data-p', async () => {
    const { tree, svg } = await draw('flowchart TD\n  A --> B', {
      // `auto` is a v13 theme name the v12 schema enum does not list yet.
      config: { theme: 'auto' },
      idPrefix: 'p7',
    });
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(tree.getAttr(root, 'data-p')).toBe('p7');
    expect(svg).toMatch(/^<svg[^>]*><style>svg\[data-p=p7\]\{--_/);
    expect(assertInertOk(svg, true)).toBe(true);
  });

  it('draws a collapsed subgraph as one node and redirects edges to it', async () => {
    const { tree } = await draw(
      'flowchart TD\n  X --> P\n  subgraph grp[Group]\n    P --> Q\n  end\n  grp@{ view: collapsed }'
    );
    expect(byAst(tree, 'n:P')).toHaveLength(0);
    const node = byAst(tree, 's:grp')[0]!;
    expect(tree.getAttr(node, 'class')).toBe('node cluster collapsed');
    expect(tree.find({ class: 'clusters' })).toHaveLength(0);
    expect(byAst(tree, 'e:X>P')).toHaveLength(1);
    expect(byAst(tree, 'e:P>Q')).toHaveLength(0);
  });

  describe('collapsed subgraph shape (v12 collapsedGroup)', () => {
    const COLLAPSED =
      'flowchart TD\n  X --> P\n  subgraph grp[Group]\n    P --> Q\n  end\n  grp@{ view: collapsed }';
    const parts = async (text: string, config?: InitializeConfig) => {
      const { tree } = await draw(text, { config });
      const node = byAst(tree, 's:grp')[0]!;
      const kids = tree.children(node);
      return {
        tree,
        node,
        rects: kids.filter((c) => tree.tag(c) === 'rect'),
        seps: kids.filter((c) => tree.getAttr(c, 'class') === 'collapsed-separator'),
        dots: kids.filter((c) => tree.getAttr(c, 'class') === 'collapsed-indicator'),
      };
    };
    const num = (tree: SvgView, n: SvgElement, a: string): number => Number(tree.getAttr(n, a));

    it('draws one rounded card, one dashed separator and three dots', async () => {
      const { tree, rects, seps, dots } = await parts(COLLAPSED, { theme: 'default' });
      expect(rects).toHaveLength(1);
      expect(num(tree, rects[0]!, 'rx')).toBe(5);
      expect(seps).toHaveLength(1);
      expect(tree.getAttr(seps[0]!, 'stroke-dasharray')).toBe('3,3');
      expect(dots).toHaveLength(3);
      expect(dots.map((d) => num(tree, d, 'r'))).toEqual([2.5, 2.5, 2.5]);
      expect(dots.map((d) => num(tree, d, 'cx'))).toEqual([-10, 0, 10]);
    });

    it('lays the card out like v12: separator inset 8, indicator row below the label', async () => {
      const { tree, rects, seps, dots } = await parts(COLLAPSED, { theme: 'default' });
      const r = rects[0]!;
      const x = num(tree, r, 'x');
      const y = num(tree, r, 'y');
      const W = num(tree, r, 'width');
      const H = num(tree, r, 'height');
      expect(x).toBe(-W / 2);
      expect(y).toBe(-H / 2);
      const s = seps[0]!;
      expect(num(tree, s, 'x1')).toBe(x + 8);
      expect(num(tree, s, 'x2')).toBe(x + W - 8);
      // height = label + 8 (gap) + 20 (indicator row) + 2 * 8; separator under label + gap.
      const label = H - 8 - 20 - 16;
      expect(num(tree, s, 'y1')).toBeCloseTo(y + 8 + label + 8, 1);
      expect(num(tree, s, 'y2')).toBe(num(tree, s, 'y1'));
      expect(num(tree, dots[0]!, 'cy')).toBeCloseTo(num(tree, s, 'y1') + 10, 1);
    });

    it('is at least 80 wide, and label width + 16 for a wide label', async () => {
      const narrow = await parts(COLLAPSED.replace('[Group]', '[G]'));
      expect(num(narrow.tree, narrow.rects[0]!, 'width')).toBe(80);
      const long = 'A much longer collapsed group title';
      const wide = await parts(COLLAPSED.replace('[Group]', `[${long}]`));
      const W = num(wide.tree, wide.rects[0]!, 'width');
      expect(W).toBeGreaterThan(80);
      // The separator spans the label: W - 16 is the label width.
      const s = wide.seps[0]!;
      expect(num(wide.tree, s, 'x2') - num(wide.tree, s, 'x1')).toBeCloseTo(W - 16, 1);
    });

    it('colours the separator and dots with clusterBorder', async () => {
      const { tree, seps, dots } = await parts(COLLAPSED, {
        theme: 'default',
        themeVariables: { clusterBorder: '#123456' },
      });
      const stroke = tree.getAttr(seps[0]!, 'stroke')!;
      expect(stroke).toMatch(/#123456|var\(--/);
      for (const d of dots) expect(tree.getAttr(d, 'fill')).toBe(stroke);
      const nodeStroke = tree.getAttr(
        (await parts(COLLAPSED, { theme: 'default' })).rects[0]!,
        'stroke'
      );
      expect(stroke).not.toBe(nodeStroke);
    });

    // Signed distance from (x, y) to the card's rounded outline (0 on it), card at (cx, cy).
    const outline = (tree: SvgView, node: SvgElement, card: SvgElement) => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tree.getAttr(node, 'transform')!)!;
      const [cx, cy] = [Number(m[1]), Number(m[2])];
      const [W, H, r] = ['width', 'height', 'rx'].map((a) => num(tree, card, a)) as [
        number,
        number,
        number,
      ];
      return (x: number, y: number): number => {
        const qx = Math.abs(x - cx) - (W / 2 - r);
        const qy = Math.abs(y - cy) - (H / 2 - r);
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      };
    };
    // The arrowhead's first point is its tip, where the edge meets the shape when the theme's
    // arrowheadGap is 0.
    const tipOf = (tree: SvgView, edge: SvgElement): [number, number] => {
      const head = tree.children(edge).find((c) => tree.getAttr(c, 'class') === 'marker')!;
      const m = /^M([-\d.]+),([-\d.]+)/.exec(tree.getAttr(head, 'd')!)!;
      return [Number(m[1]), Number(m[2])];
    };

    it('ends edges on the card outline', async () => {
      const text =
        'flowchart TD\n  A & B & C --> P\n  subgraph grp[A wide collapsed group title]\n    P\n  end\n  grp@{ view: collapsed }';
      // With no arrowhead gap, so the tip is where the edge meets the shape.
      const { tree, node, rects } = await parts(text, {
        theme: 'redux',
        themeVariables: { arrowheadGap: 0 },
      });
      const off = outline(tree, node, rects[0]!);
      for (const from of ['A', 'B', 'C'])
        expect(Math.abs(off(...tipOf(tree, byAst(tree, `e:${from}>P`)[0]!)))).toBeLessThan(0.5);
    });

    it('ends an edge that reaches a rounded corner on the curve, not the layout box', async () => {
      // A postLayout hook brings the edge down 3px in from the card's top-right corner.
      const m = createMermaid();
      m.initialize({ deterministic: true, theme: 'redux', themeVariables: { arrowheadGap: 0 } });
      await m.registerExternalDiagrams([
        {
          id: 'to-the-corner',
          postLayout(l) {
            if (l.kind !== 'graph') return l;
            const card = l.layout.nodes.get('grp')!;
            const x = card.x + card.width / 2 - 3;
            const top = card.y - card.height / 2;
            for (const e of l.layout.edges.values()) {
              const [first, last] = [e.points[0]!, e.points.at(-1)!];
              e.points = [
                { ...first, x, y: top - 40 },
                { ...last, x, y: top },
              ];
            }
            return l;
          },
        },
      ]);
      const text =
        'flowchart TD\n  X --> P\n  subgraph grp[Group]\n    P\n  end\n  grp@{ view: collapsed }';
      const tree = parseSvg((await m.render('mermaid-0', text)).svg);
      const node = byAst(tree, 's:grp')[0]!;
      const card = tree.children(node).find((c) => tree.tag(c) === 'rect')!;
      expect(num(tree, card, 'rx')).toBe(12);
      const off = outline(tree, node, card);
      expect(Math.abs(off(...tipOf(tree, byAst(tree, 'e:X>P')[0]!)))).toBeLessThan(0.5);
    });

    it('has the same shape across themes apart from the radius', async () => {
      const a = await parts(COLLAPSED, { theme: 'default' });
      const b = await parts(COLLAPSED, { theme: 'redux' });
      expect(num(b.tree, b.rects[0]!, 'rx')).toBe(12);
      const geom = (p: typeof a) => ({
        seps: p.seps.length,
        dots: p.dots.map((d) => [p.tree.getAttr(d, 'cx'), p.tree.getAttr(d, 'r')]),
        cls: p.tree.getAttr(p.node, 'class'),
      });
      expect(geom(b)).toEqual(geom(a));
    });
  });

  it('keeps an invisible edge as an empty element, laid out but not drawn', async () => {
    const { tree } = await draw('flowchart LR\n  A ~~~ B');
    const edge = byAst(tree, 'e:A>B')[0]!;
    expect(tree.children(edge)).toHaveLength(0);
    expect(tree.getAttr(edge, 'class')).toContain('edge-thickness-invisible');
  });

  it('draws images through the URL check', async () => {
    const { tree, warnings } = await draw(
      'flowchart TD\n  A@{ img: "/a.png", label: "pic", w: 60, h: 40 }\n  B@{ img: "javascript:x" }'
    );
    const images = tree.find({ tag: 'image' });
    expect(images.map((i) => tree.getAttr(i, 'href'))).toEqual(['/a.png']);
    expect(tree.getAttr(images[0]!, 'width')).toBe('60');
    expect(warnings.map((w) => w.code)).toContain('URL_REFUSED');
  });

  it('draws linear, stepped and curved edges differently', async () => {
    const d = async (curve: 'linear' | 'step' | 'basis'): Promise<string> => {
      const { tree } = await draw('flowchart TD\n  A --> B & C', {
        config: { flowchart: { curve } },
      });
      return tree.getAttr(tree.children(byAst(tree, 'e:A>C')[0]!)[0]!, 'd')!;
    };
    expect(await d('linear')).not.toMatch(/[CQ]/);
    expect(await d('step')).toMatch(/Q/);
    expect(await d('basis')).toMatch(/C/);
  });

  it('lays markdown labels out with bold runs and wraps them at wrappingWidth', async () => {
    const { tree } = await draw(
      'flowchart TD\n  A["`**bold** and a rather long label that has to wrap somewhere`"]'
    );
    const text = tree.find({ tag: 'text' })[0]!;
    const spans = tree.children(text);
    expect(spans.length).toBeGreaterThan(2);
    expect(tree.getAttr(spans[0]!, 'font-weight')).toBe('bold');
  });

  it('renders classDef text styles: colour and font size on the label', async () => {
    const small = await draw('flowchart TD\n  A[Label]');
    const big = await draw(
      'flowchart TD\n  A[Label]:::big\n  classDef big color:#ff0000,font-size:40px'
    );
    const height = (r: typeof small): number =>
      Number(r.tree.getAttr(r.tree.children(byAst(r.tree, 'n:A')[0]!)[0]!, 'height'));
    expect(height(big)).toBeGreaterThan(height(small));
    const text = big.tree.find({ tag: 'text' })[0]!;
    expect(big.tree.getAttr(text, 'fill')).toBe('#ff0000');
    expect(big.tree.getAttr(text, 'font-size')).toBe('40px');
  });
});

describe('flowchart render: arrowheads from theme variables (D152)', () => {
  // v12 12.2.0 markers.js and lineWithOffset.ts, worked out by hand: neo `pointEnd-margin` is
  // a 11.5×14 viewBox met into 10.5×14 (10.5 long, 14×10.5/11.5 wide) with its tip 4 before
  // the outline; classic `pointEnd` is 10×10 into 8×8 with its tip on the outline. Circles
  // are 14 (neo, refX 12.25 → gap 2.25×1.4) and 11 (classic, refX 11 → gap 1×1.1). Crosses
  // are 12 (neo, refX 17.7 → gap 3.7×0.8, stroke 2.5) and 11 (classic, refX 12 → gap 2,
  // stroke 2).
  const nums = (d: string): number[] => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
  const near = (n: number) => expect.closeTo(n, 1);

  async function arrowhead(edge: string, theme: string, themeVariables?: Record<string, unknown>) {
    const { svg, tree } = await draw(`flowchart TD\n  A ${edge} B`, {
      config: { theme, themeVariables, output: { cssVariables: false } } as InitializeConfig,
    });
    const node = byAst(tree, 'n:B')[0]!;
    const ty = nums(tree.getAttr(node, 'transform')!)[1]!;
    const shape = tree.children(node)[0]!;
    const outline = ty + Number(tree.getAttr(shape, 'y'));
    const head = tree.find({ class: 'marker' })[0]!;
    return { svg, tree, head, outline };
  }

  async function point(theme: string, themeVariables?: Record<string, unknown>) {
    const { svg, tree, head, outline } = await arrowhead('-->', theme, themeVariables);
    const [tx, ty, ax, ay, bx, by] = nums(tree.getAttr(head, 'd')!) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    return {
      svg,
      gap: outline - ty,
      length: Math.hypot(tx - (ax + bx) / 2, ty - (ay + by) / 2),
      width: Math.hypot(ax - bx, ay - by),
    };
  }

  it('stops a point arrowhead 4px before the node in redux-color, v12-neo sized', async () => {
    const p = await point('redux-color');
    expect(p.gap).toEqual(near(4));
    expect(p.length).toEqual(near(10.5));
    expect(p.width).toEqual(near(12.78));
  });

  it('puts a point arrowhead tip on the node in default, v12-classic sized', async () => {
    const p = await point('default');
    expect(p.gap).toEqual(near(0));
    expect(p.length).toEqual(near(8));
    expect(p.width).toEqual(near(8));
  });

  it('takes the point gap and size from themeVariables', async () => {
    expect((await point('redux-color', { arrowheadGap: 0 })).gap).toEqual(near(0));
    const big = await point('default', { arrowheadGap: '6px', arrowheadLength: 20 });
    expect(big.gap).toEqual(near(6));
    expect(big.length).toEqual(near(20));
  });

  it.each([
    ['redux-color', 14, 3.15],
    ['default', 11, 1.1],
  ])('sizes a circle arrowhead in %s as %d with gap %d', async (theme, size, gap) => {
    const { tree, head, outline } = await arrowhead('--o', theme);
    const r = Number(tree.getAttr(head, 'r'));
    expect(2 * r).toEqual(near(size));
    expect(outline - (Number(tree.getAttr(head, 'cy')) + r)).toEqual(near(gap));
  });

  it.each([
    ['redux-color', 12, 2.96, 2.5],
    ['default', 11, 2, 2],
  ])('sizes a cross arrowhead in %s as %d with gap %d', async (theme, size, gap, stroke) => {
    const { tree, head, outline } = await arrowhead('--x', theme);
    const ys = nums(tree.getAttr(head, 'd')!).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toEqual(near(size));
    expect(outline - Math.max(...ys)).toEqual(near(gap));
    expect(Number(tree.getAttr(head, 'stroke-width'))).toBe(stroke);
  });

  it.each(['redux-color', 'default'])(
    'keeps the line under the arrowhead and writes no markers in %s',
    async (theme) => {
      for (const edge of ['-->', '-.->', '==>', '--o', '--x']) {
        const { svg, tree, outline } = await arrowhead(edge, theme);
        expect(svg).not.toMatch(/<defs|<marker|marker-end/);
        const line = tree.find((n, t) => t.tag(n) === 'path' && !t.getAttr(n, 'class'))[0]!;
        const end = nums(tree.getAttr(line, 'd')!).at(-1)!;
        expect(end, edge).toBeLessThan(outline);
      }
    }
  );
});

describe('flowchart render: look is removed (D153)', () => {
  const plain = 'flowchart TD\n  A[Start] --> B(End)';
  const withLook = (look: string) => `---\nconfig:\n  look: ${look}\n---\n${plain}`;
  const lookWarnings = (r: RenderResult) => r.warnings.filter((w) => w.code === 'LOOK_REMOVED');

  it.each(['neo', 'handDrawn', 'classic'])(
    'front matter `look: %s` renders identically to no look, with one LOOK_REMOVED warning',
    async (look) => {
      const without = await draw(plain);
      const result = await draw(withLook(look));
      expect(result.svg).toBe(without.svg);
      expect(lookWarnings(result)).toHaveLength(1);
      expect(result.warnings.map((w) => w.code)).not.toContain('CONFIG_UNKNOWN_KEY');
      expect(lookWarnings(without)).toHaveLength(0);
    }
  );

  it('warns once when look is set at top level and in the flowchart section', async () => {
    const result = await draw(
      `---\nconfig:\n  look: neo\n  flowchart:\n    look: classic\n---\n%%{init: {"look": "handDrawn"}}%%\n${plain}`
    );
    expect(lookWarnings(result)).toHaveLength(1);
    expect(result.svg).toBe((await draw(plain)).svg);
  });

  it('initialize({ look }) does not throw and the render warns LOOK_REMOVED', async () => {
    const result = await draw(plain, { config: { look: 'neo' } });
    expect(lookWarnings(result)).toHaveLength(1);
    expect(result.svg).toBe((await draw(plain)).svg);
  });
});

function assertInertOk(svg: string, themeStyle: boolean): boolean {
  assertInert(svg, { themeStyle });
  return true;
}
