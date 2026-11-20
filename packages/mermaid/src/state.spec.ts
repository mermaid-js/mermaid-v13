import { describe, expect, it } from 'vitest';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { assertInert, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { state } from '@mermaid-js/diagram-state';
import {
  createMermaid,
  MermaidError,
  UnsupportedFormatError,
  type ExtensionPlugin,
} from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

// State is a first-party type (#148): both v12 keywords go to `@mermaid-js/diagram-state`
// through the generated registry, in v12's detector order (D101).
const V1 = 'stateDiagram\n  [*] --> Still\n  Still --> Moving : push\n  Moving --> [*]\n';
const V2 = 'stateDiagram-v2\n  [*] --> Still\n  Still --> Moving : push\n  Moving --> [*]\n';

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

describe('state diagrams through the public API (#148)', () => {
  it.each([
    ['stateDiagram', V1],
    ['stateDiagram-v2', V2],
  ])('renders the %s keyword', async (_keyword, text) => {
    const m = createMermaid();
    const result = await m.render('s1', text);
    expect(result.diagramType).toBe('stateDiagram');
    expect(result.svg).toContain('aria-roledescription="stateDiagram"');
    expect(result.svg).toContain('class="mermaid mermaid-state statediagram"');
    expect(result.svg).toContain('push');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('draws both keywords alike (one renderer, D101)', async () => {
    const m = createMermaid();
    const v1 = await m.render('s', V1);
    const v2 = await m.render('s', V2.replace('stateDiagram-v2', 'stateDiagram'));
    expect(v1.svg).toBe(v2.svg);
    expect((await m.render('s', V2)).svg).toBe(v1.svg);
  });

  it('defaults to layered even with an ELK plugin registered (D127, R-LAYOUT-7)', async () => {
    let calls = 0;
    const elk: LayoutEngine = (graph, ctx) => {
      calls++;
      return layered(graph, ctx);
    };
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'elk', loader: () => Promise.resolve(elk) }]);
    await m.render('s', V2);
    expect(calls).toBe(0);
    await m.render('s', `---\nconfig:\n  layout: elk\n---\n${V2}`);
    expect(calls).toBe(1);
    expect(state.configDefaults.layout).toBe('layered');
  });

  it('warns for statements that do nothing (pitfall 22)', async () => {
    const text =
      'stateDiagram-v2\n  scale 300 width\n  state X {\n    a\n    class a c\n  }\n  click C "https://x" "t"\n';
    const { warnings } = await createMermaid().render('s', text);
    expect(warnings.map((w) => w.code)).toEqual([
      'SCALE_IGNORED',
      'IGNORED_IN_COMPOSITE',
      'LINK_NOT_DRAWN',
    ]);
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(V2);
    expect(m.renderSync(V2).svg).toContain('mermaid-state');
  });

  it('reports a syntax error as a positioned MermaidError', async () => {
    const e = await rejection(createMermaid().render('s', 'stateDiagram-v2\n  A --> \n  -->'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBeGreaterThan(1);
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D100)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('stateDiagram', 'svg')).toBe(true);
    expect(m.supportsFormat('state', 'svg')).toBe(true);
    expect(m.supportsFormat('state', 'ascii')).toBe(false);
    expect(m.supportsFormat('stateDiagram', 'ascii')).toBe(false);
    const e = await rejection(m.render('s', V2, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('stateDiagram');
    await m.prepare(V2);
    expect(() => m.renderSync(V2, { format: 'ascii' })).toThrow(UnsupportedFormatError);
  });

  it('reads the state config section (useMaxWidth, nodeSpacing)', async () => {
    const m = createMermaid();
    const wide = await m.render('s', V2);
    expect(wide.svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('s', '---\nconfig:\n  state:\n    useMaxWidth: false\n---\n' + V2);
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d+"/);
    const roomy = await m.render('s', '---\nconfig:\n  state:\n    rankSpacing: 200\n---\n' + V2);
    expect(roomy.height).toBeGreaterThan(wide.height);
  });

  it('renders through mermaid/slim with the state plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [state] });
    expect((await slim.render('s', V2)).svg).toBe((await createMermaid().render('s', V2)).svg);
  });
});

/**
 * v12 12.2.0 under `theme: neo` (computed styles in Chromium, #234): the gradient strokes state
 * boxes, described states, the choice diamond, fork and join bars, notes, composite outer and
 * inner rects, the start dot and both end rings; the start dot and bars keep their lineColor
 * fill, the end dot its nodeBorder fill. Transitions, labels and arrowheads stay plain, and so
 * does a described state's divider (v12 strokes it nodeBorder).
 */
describe('state in the neo themes (D182, #234)', () => {
  const NEO_STATE = [
    'stateDiagram-v2',
    '  state c <<choice>>',
    '  state f <<fork>>',
    '  state j <<join>>',
    '  [*] --> Idle',
    '  Idle --> c : go',
    '  c --> Box',
    '  state Box {',
    '    [*] --> Inner',
    '    state Nested {',
    '      [*] --> Deep',
    '    }',
    '    --',
    '    [*] --> Other',
    '  }',
    '  Box --> f',
    '  f --> A',
    '  f --> B',
    '  A --> j',
    '  B --> j',
    '  j --> Done',
    '  Done : Done',
    '  Done : described',
    '  note right of Done : a note',
    '  classDef hot fill:#f96,stroke:#333',
    '  class B hot',
    '  Done --> [*]',
  ].join('\n');
  const URL = 'url(#s-gradient)';

  type Theme = NonNullable<Parameters<ReturnType<typeof createMermaid>['initialize']>[0]['theme']>;
  async function draw(theme: Theme): Promise<{ svg: string; tree: SvgTree }> {
    let tree: SvgTree | undefined;
    const hook: ExtensionPlugin = {
      id: 'tree',
      postRender(t) {
        tree = t;
      },
    };
    const m = createMermaid();
    await m.registerExternalDiagrams([hook]);
    m.initialize({ deterministic: true, theme });
    const { svg } = await m.render('s', NEO_STATE);
    return { svg, tree: tree! };
  }
  const byId = (tree: SvgTree, id: string): SvgNode =>
    tree.find((n, t) => t.getAttr(n, 'data-id') === id && !!t.getAttr(n, 'class'))[0]!;
  const shapes = (tree: SvgTree, node: SvgNode): SvgNode[] => {
    const kids = tree.children(node).flatMap((c) => (tree.tag(c) === 'a' ? tree.children(c) : [c]));
    return kids.filter((c) => ['rect', 'polygon', 'circle', 'line'].includes(tree.tag(c)!));
  };
  const attr = (tree: SvgTree, n: SvgNode, a: 'stroke' | 'fill') => tree.getAttr(n, a);

  for (const theme of ['neo', 'neo-dark'] as const) {
    it(`strokes every state outline with the gradient under ${theme}`, async () => {
      const { tree } = await draw(theme);
      for (const id of ['Idle', 'c', 'Done', 'Inner', 'Deep', 'Other', 'A', 'f', 'j', 'note:1']) {
        expect(attr(tree, shapes(tree, byId(tree, id))[0]!, 'stroke'), id).toBe(URL);
      }
      for (const id of ['Box', 'Nested']) {
        const [outer, inner] = shapes(tree, byId(tree, id));
        expect(attr(tree, outer!, 'stroke'), `${id} outer`).toBe(URL);
        expect(attr(tree, inner!, 'stroke'), `${id} inner`).toBe(URL);
      }
      const [start] = shapes(tree, byId(tree, 'root_start'));
      expect(attr(tree, start!, 'stroke')).toBe(URL);
      const [ring, dot] = shapes(tree, byId(tree, 'root_end'));
      expect(attr(tree, ring!, 'stroke')).toBe(URL);
      expect(attr(tree, dot!, 'stroke')).toBe(URL);
    });

    it(`keeps fills, dividers, transitions and labels plain under ${theme}`, async () => {
      const { svg, tree } = await draw(theme);
      expect(svg).not.toMatch(/fill="url\(/);
      // Transitions take the canvas line colour (D668), the start dot and bars lineColor.
      expect(tree.getAttr(tree.find({ class: 'edgePaths' })[0]!, 'stroke')).toBe('var(--_cvl)');
      const line = 'var(--_l)';
      const [start] = shapes(tree, byId(tree, 'root_start'));
      expect(attr(tree, start!, 'fill')).toBe(line);
      expect(attr(tree, shapes(tree, byId(tree, 'f'))[0]!, 'fill')).toBe(line);
      const [, dot] = shapes(tree, byId(tree, 'root_end'));
      expect(attr(tree, dot!, 'fill')).toBe('var(--_nb)');
      // A line has a zero-width or zero-height box, which a bounding-box gradient leaves unpainted.
      const dividers = tree.find({ class: 'divider' });
      expect(dividers).toHaveLength(2);
      for (const d of dividers) expect(tree.getAttr(d, 'stroke')).toBe('var(--_nb)');
      const edges = svg.slice(svg.indexOf('<g class="edgePaths"'), svg.indexOf('<g class="nodes"'));
      expect(edges).not.toContain('url(');
    });

    it(`lets classDef and style strokes win over the gradient under ${theme}`, async () => {
      const { tree } = await draw(theme);
      expect(attr(tree, shapes(tree, byId(tree, 'B'))[0]!, 'stroke')).toBe('#333');
    });
  }

  it.each(['default', 'redux', 'redux-dark-color', 'dark'] as const)(
    'writes no gradient under %s',
    async (theme) => {
      const { svg } = await draw(theme);
      expect(svg).not.toContain('<defs');
      expect(svg).not.toContain('url(#');
    }
  );
});
