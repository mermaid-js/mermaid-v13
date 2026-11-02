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
      config: { theme: 'auto' as 'dark' },
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

function assertInertOk(svg: string, themeStyle: boolean): boolean {
  assertInert(svg, { themeStyle });
  return true;
}
