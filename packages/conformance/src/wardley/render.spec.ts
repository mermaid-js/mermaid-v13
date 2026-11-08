import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import {
  detectWardley,
  layoutWardley,
  wardley,
  WARDLEY_LINK_DROPPED,
  type WardleyLayout,
  type WardleyModel,
} from '@mermaid-js/diagram-wardley';
import {
  MermaidError,
  UnsupportedFormatError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { pathPoints } from '../sequence/path-bounds.ts';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { wardleyCases, wardleyGateCorpus } from './corpus.ts';
import { wardleyApi } from './render-api.ts';

/**
 * Render properties of the wardley renderer (spec #430 T4, DESIGN §13.2, §13.4) over the wardley
 * gate corpus (e2e fixtures, v12 spec strings, the hand-written cases, each also with CRLF and
 * comment lines), through the public `render()` with `deterministic: true`, in a classic, a
 * redux and an `auto` theme: well-formed XML, the allow-list, render-twice determinism, no
 * NaN/Infinity/undefined, no `foreignObject`, marker or `<defs>`, no empty `<g>`, every drawn
 * coordinate inside the viewBox, ids only on the title and description, and the AST round-trip
 * (R-PARSE-8).
 *
 * The round-trip rule for wardley's AST: every element with `data-ast` names an AST node of a
 * drawn type and carries the same `data-id`, and the elements with one are exactly what the
 * layout drew, each once: every model node (its first statement: a repeat, which v12 merged,
 * maps to none), every drawn link and trend, pipeline box, note, annotation marker and
 * (de)accelerator, the annotation box, the in-text title (the last, D218) and the custom
 * evolution (the last). A link that is not drawn is named by the parse's or the layout's
 * `WARDLEY_LINK_DROPPED`, or runs from a pipeline child to its own parent (v12's silent skip).
 *
 * The probes below are `corpus/wardley-cases.json`'s `wardley-cases/render-*` cases (also in the
 * gate corpus above).
 */
const THEMES = [
  'default',
  'redux-color',
  'auto',
] as const satisfies readonly MermaidConfig['theme'][];

/** The AST node types that are drawn. */
const DRAWN = new Set([
  'Anchor',
  'Component',
  'PipelineComponent',
  'Pipeline',
  'Link',
  'Evolve',
  'Note',
  'Annotation',
  'Annotations',
  'Accelerator',
  'Deaccelerator',
  'Title',
  'Evolution',
]);

interface Case {
  id: string;
  theme: (typeof THEMES)[number];
  source: string;
  result: RenderResult;
  tree: SvgView;
  prepared: Prepared;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];
let api: Mermaid;
let layoutTheme: Theme;

beforeAll(async () => {
  api = await wardleyApi();
  layoutTheme = createTheme(await loadTheme('default'), { diagram: wardley.theme });
  const corpus = await wardleyGateCorpus();
  for (const theme of THEMES) {
    const themed = await wardleyApi({ theme });
    for (const item of corpus) {
      if (!detectWardley(item.source)) continue;
      try {
        const prepared = await themed.prepare(item.source, { id: 'mermaid-0' });
        const result = themed.renderSync(item.source, { id: 'mermaid-0' });
        cases.push({
          id: `${theme} ${item.id}`,
          theme,
          source: item.source,
          result,
          tree: parseSvg(result.svg),
          prepared,
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
      }
    }
  }
}, 240_000);

// The writer rounds coordinates to two decimals.
const TOL = 0.01;

/** Every coordinate an element draws at; strokes count by their half width. */
function extents(tree: SvgView): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  const walk = (node: SvgElement): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const half = at('stroke-width') / 2;
    const put = (x: number, y: number, r = 0): void => {
      out.push({ x: x - r, y: y - r, tag: tag ?? '' });
      out.push({ x: x + r, y: y + r, tag: tag ?? '' });
    };
    const transform = tree.getAttr(node, 'transform');
    // Only a text turns, about its own anchor (v12's `rotate(a x y)`).
    if (transform !== undefined) {
      expect(tag, transform).toBe('text');
      expect(transform).toMatch(/^rotate\(-?[\d.]+,-?[\d.]+,-?[\d.]+\)$/);
      const [, x, y] = transform.slice(7, -1).split(',');
      expect([x, y]).toEqual([tree.getAttr(node, 'x'), tree.getAttr(node, 'y')]);
    }
    if (tag === 'rect') {
      put(at('x'), at('y'), half);
      put(at('x') + at('width'), at('y') + at('height'), half);
    } else if (tag === 'circle') put(at('cx'), at('cy'), at('r') + half);
    else if (tag === 'line') {
      put(at('x1'), at('y1'), half);
      put(at('x2'), at('y2'), half);
    } else if (tag === 'path') {
      for (const p of pathPoints(tree.getAttr(node, 'd') ?? '')) put(p.x, p.y, half);
    } else if (tag === 'text' && tree.getAttr(node, 'x') !== undefined) put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c);
  };
  walk(tree.root);
  return out;
}

/** The layout the render drew (the drop rules do not depend on the measurer). */
const layoutOf = (c: Case): WardleyLayout =>
  layoutWardley(c.prepared.parse.model as WardleyModel, {
    config: c.prepared.config,
    measurer: tableMeasurer,
    theme: layoutTheme,
  });

describe('wardley render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(300);
    // Inputs v13 rejects are the parser's business (#489 parity); none fail to render.
    expect(skipped.filter((s) => !s.reason.startsWith('SYNTAX'))).toEqual([]);
    // Every render probe renders.
    const probes = wardleyCases().filter((c) => c.id.startsWith('wardley-cases/render-'));
    for (const p of probes)
      expect(
        cases.some((c) => c.id === `default ${p.id}`),
        p.id
      ).toBe(true);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.prepared.config.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic: a fresh API object renders the same bytes (R-ARCH-6)', async () => {
    const fresh = new Map<string, Mermaid>();
    for (const theme of THEMES) fresh.set(theme, await wardleyApi({ theme }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 120_000);

  it('writes no NaN, Infinity, undefined, foreignObject, marker or defs, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|<marker|<defs|marker-(start|end)/
      );
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no empty <g> and no element ids but the title and description', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/<g\b[^>]*\/>|<g\b[^>]*><\/g>/);
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox (D224)', () => {
    for (const c of cases) {
      const { tree } = c;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every drawn item to one data-ast element and back (R-PARSE-8)', () => {
    let droppedLinks = 0;
    let repeats = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as WardleyModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(DRAWN.has(node!.type), `${c.id}: ${id} is a ${node!.type}`).toBe(true);
        expect(tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
      }
      const layout = layoutOf(c);
      const expected = [
        ...layout.nodes.map((n) => n.ast),
        ...layout.links.map((l) => l.ast),
        ...layout.trends.map((t) => t.ast),
        ...layout.pipelines.map((p) => p.ast),
        ...layout.notes.map((n) => n.ast),
        ...layout.annotations.map((a) => a.ast),
        ...(layout.annotationsBox ? [layout.annotationsBox.ast] : []),
        ...layout.accelerators.map((a) => a.ast),
        ...layout.deaccelerators.map((a) => a.ast),
        ...(model.titleAstId !== undefined && layout.title ? [model.titleAstId] : []),
        ...(model.evolution ? [model.evolution.astId] : []),
      ];
      expect([...seen.keys()].sort(), c.id).toEqual([...expected].sort());
      for (const [id, n] of seen) expect(n, `${c.id}: ${id}`).toBe(1);
      // Every model node, note, annotation and (de)accelerator is drawn.
      for (const list of [
        model.nodes,
        model.notes,
        model.annotations,
        model.accelerators,
        model.deaccelerators,
      ])
        for (const item of list) expect(seen.get(item.astId), `${c.id}: ${item.astId}`).toBe(1);
      // An AST node of a drawn type that maps to none is a repeat (`@n`) or a dropped link.
      const children = new Map(model.pipelines.map((p) => [p.nodeId, new Set(p.componentIds)]));
      const dropped = new Set(
        [...parse.diagnostics, ...c.result.warnings].flatMap((d) =>
          'code' in d && d.code === WARDLEY_LINK_DROPPED
            ? [...(('astIds' in d ? d.astIds : undefined) ?? [])]
            : []
        )
      );
      for (const link of model.links) {
        if (seen.has(link.astId)) continue;
        droppedLinks++;
        const childToParent = children.get(link.target)?.has(link.source) ?? false;
        const named =
          dropped.has(link.astId) ||
          parse.diagnostics.some(
            (d) =>
              d.code === WARDLEY_LINK_DROPPED &&
              [d.range, ...(d.related ?? []).map((r) => r.range)].some(
                (r) => r.start === index.get(link.astId)!.range.start
              )
          );
        expect(childToParent || named, `${c.id}: ${link.astId} dropped silently`).toBe(true);
      }
      for (const id of index.keys())
        if (DRAWN.has(index.get(id)!.type) && !seen.has(id) && /@\d+$/.test(id)) repeats++;
    }
    expect(droppedLinks).toBeGreaterThan(0);
    expect(repeats).toBeGreaterThan(0);
  });
});

const byClass = (tree: SvgView, cls: string): SvgElement[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').split(' ').includes(cls));
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
const attr = (tree: SvgView, n: SvgElement | undefined, name: string): string | undefined =>
  n && tree.getAttr(n, name as never);
const classes = (tree: SvgView, nodes: SvgElement[]): (string | undefined)[] =>
  nodes.map((n) => attr(tree, n, 'class') ?? tree.tag(n));
const render = async (src: string, m: Mermaid = api) => {
  const result = await m.render('x', src);
  return { ...result, tree: parseSvg(result.svg) };
};

/** A `wardley-cases/render-<name>` source from `corpus/wardley-cases.json`. */
const CASES = new Map(wardleyCases().map((c) => [c.id, c.source]));
function probe(name: string): string {
  const source = CASES.get(`wardley-cases/render-${name}`);
  if (source === undefined) throw new Error(`no wardley-cases/render-${name}`);
  return source;
}

const map = (tree: SvgView): SvgElement => byClass(tree, 'wardley-map')[0]!;

describe('wardley render: what is drawn', () => {
  it('draws in v12 group order under g.wardley-map', async () => {
    const { tree } = await render(probe('everything'));
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(classes(tree, tree.children(root))).toEqual(['wardley-map']);
    expect(classes(tree, tree.children(map(tree)))).toEqual([
      'wardley-background',
      'wardley-title',
      'wardley-axes',
      'wardley-stages',
      'wardley-pipelines',
      'wardley-pipeline-links',
      'wardley-links',
      'wardley-trends',
      'wardley-nodes',
      'wardley-annotations',
      'wardley-notes',
      'wardley-accelerators',
      'wardley-deaccelerators',
    ]);
    const [axes] = byClass(tree, 'wardley-axes');
    expect(classes(tree, tree.children(axes!))).toEqual([
      'line',
      'line',
      'wardley-axis-label wardley-axis-label-x',
      'wardley-axis-label wardley-axis-label-y',
    ]);
    // Stages: each label after its divider (none before the first).
    const [stages] = byClass(tree, 'wardley-stages');
    expect(classes(tree, tree.children(stages!))).toEqual([
      'wardley-stage-label',
      'line',
      'wardley-stage-label',
      'line',
      'wardley-stage-label',
    ]);
    expect(attr(tree, stages, 'data-ast')).toBe('evolution');
    const [annotations] = byClass(tree, 'wardley-annotations');
    expect(classes(tree, tree.children(annotations!))).toEqual([
      'wardley-annotation',
      'wardley-annotations-box',
    ]);
    const [links] = byClass(tree, 'wardley-links');
    expect(classes(tree, tree.children(links!))).toEqual([
      'wardley-link',
      'wardley-link-head',
      'wardley-link wardley-link--dashed',
      'wardley-link-label',
    ]);
  });

  it('draws the default stages without a data-ast and no grid without showGrid', async () => {
    const { tree } = await render(probe('simple'));
    const [stages] = byClass(tree, 'wardley-stages');
    expect(byClass(tree, 'wardley-stage-label').map((n) => textOf(tree, n))).toEqual([
      'Genesis',
      'Custom Built',
      'Product',
      'Commodity',
    ]);
    expect(attr(tree, stages, 'data-ast')).toBeUndefined();
    expect(byClass(tree, 'wardley-grid')).toEqual([]);
    // Groups with nothing in them are left out.
    expect(byClass(tree, 'wardley-pipelines')).toEqual([]);
    expect(byClass(tree, 'wardley-annotations')).toEqual([]);
  });

  it("draws each node's parts in v12's order", async () => {
    const { tree } = await render(probe('strategies'));
    const nodes = byClass(tree, 'wardley-node');
    const parts = Object.fromEntries(
      nodes.map((n) => [
        textOf(tree, byClass(tree, 'wardley-node-label').find((l) => l.parent === n)!),
        classes(tree, tree.children(n)),
      ])
    );
    expect(parts).toEqual({
      Built: ['wardley-build-overlay', 'circle', 'wardley-node-label'],
      Bought: ['wardley-buy-overlay', 'circle', 'wardley-node-label'],
      Outsourced: ['wardley-outsource-overlay', 'circle', 'wardley-node-label'],
      Market: [
        'wardley-market-overlay',
        ...Array<string>(3).fill('wardley-market-line'),
        ...Array<string>(3).fill('wardley-market-dot'),
        'wardley-node-label',
      ],
      Heavy: ['circle', 'wardley-inertia', 'wardley-node-label'],
      Both: ['wardley-build-overlay', 'circle', 'wardley-inertia', 'wardley-node-label'],
      P: ['rect', 'wardley-inertia', 'wardley-node-label'],
      Q: ['circle', 'wardley-node-label'],
    });
    expect(nodes.map((n) => attr(tree, n, 'class'))).toContain(
      'wardley-node wardley-node--pipeline-component'
    );
    const [inertia] = byClass(tree, 'wardley-inertia');
    expect(attr(tree, inertia, 'stroke-width')).toBe('6');
  });

  it('draws arrowheads as paths at the line ends, one per flowing end', async () => {
    const { tree } = await render(probe('flows'));
    const links = byClass(tree, 'wardley-link');
    const heads = byClass(tree, 'wardley-link-head');
    // +>, +<, +<> (two), -.->, ->, +'backup'>.
    expect(links).toHaveLength(6);
    expect(heads).toHaveLength(5);
    expect(new Set(heads.map((h) => attr(tree, h, 'data-id')))).toEqual(
      new Set(['link:A->B', 'link:B->C', 'link:C->D', 'link:A->C'])
    );
    for (const h of heads) {
      expect(attr(tree, h, 'd')).toMatch(/^M[^MLZ]+L[^MLZ]+L[^MLZ]+Z$/);
      expect(attr(tree, h, 'stroke')).toBe('none');
      expect(attr(tree, h, 'data-ast')).toBeUndefined();
    }
    const dashed = byClass(tree, 'wardley-link--dashed');
    expect(dashed.map((n) => attr(tree, n, 'stroke-dasharray'))).toEqual(['6 6']);
    const labels = byClass(tree, 'wardley-link-label');
    // `+'backup'>` labels its link too (v12: the flow label, else the `; label`).
    expect(labels.map((n) => textOf(tree, n))).toEqual(['dashed', 'up the hill', 'backup']);
    for (const l of labels) expect(attr(tree, l, 'transform')).toMatch(/^rotate\(/);
  });

  it('skips self-links, links to unknown names and child-to-parent links', async () => {
    const { tree, warnings } = await render(probe('dropped-links'));
    expect(byClass(tree, 'wardley-link').map((n) => attr(tree, n, 'data-ast'))).toEqual([
      'link:A->c',
    ]);
    expect(warnings.map((w) => w.code)).toContain(WARDLEY_LINK_DROPPED);
  });

  it('draws trends with a head in the evolution colour', async () => {
    const { tree } = await render(probe('simple'));
    const [trend] = byClass(tree, 'wardley-trend');
    const [head] = byClass(tree, 'wardley-trend-head');
    expect(attr(tree, trend, 'data-ast')).toBe('evolve:Tea');
    expect(attr(tree, trend, 'stroke-dasharray')).toBe('4 4');
    expect(attr(tree, head, 'fill')).toBe(attr(tree, trend, 'stroke'));
    expect(attr(tree, head, 'data-id')).toBe('evolve:Tea');
  });

  it('draws the annotation markers and the box, lines by number', async () => {
    const { tree } = await render(probe('annotations'));
    const markers = byClass(tree, 'wardley-annotation');
    expect(markers.map((n) => attr(tree, n, 'data-ast'))).toEqual([
      'annotation:2',
      'annotation:1',
      'annotation:3',
    ]);
    const [box] = byClass(tree, 'wardley-annotations-box');
    expect(attr(tree, box, 'data-ast')).toBe('annotations');
    const lines = tree.children(box!).filter((n) => tree.tag(n) === 'text');
    expect(lines.map((n) => textOf(tree, n))).toEqual(['1. First', '2. Second']);
  });

  it("draws v12's #name; codes as their characters and a literal &name; as written (GAPS #493)", async () => {
    const { tree, svg } = await render(probe('entities'));
    expect(textOf(tree, byClass(tree, 'wardley-title')[0]!)).toBe('A & B &amp; C');
    expect(textOf(tree, byClass(tree, 'wardley-node-label')[0]!)).toBe('Tea & &amp; "Cups"');
    const [notes] = byClass(tree, 'wardley-notes');
    expect(textOf(tree, notes!)).toBe('♥ love &lt;3');
    expect(svg).toContain('>Tea &amp; &amp;amp; &quot;Cups&quot;</text>');
  });

  it('draws the in-text title with data-ast, a front-matter one without (D218)', async () => {
    const own = await render(probe('repeated-title'));
    const [t] = byClass(own.tree, 'wardley-title');
    expect(textOf(own.tree, t!)).toBe('Last');
    expect(attr(own.tree, t, 'data-ast')).toBe('title@2');
    const front = await render(probe('front-matter-title'));
    const [f] = byClass(front.tree, 'wardley-title');
    expect(textOf(front.tree, f!)).toBe('Front');
    expect(attr(front.tree, f, 'data-ast')).toBeUndefined();
    const none = await render('wardley-beta\ncomponent A [0.5, 0.5]');
    expect(byClass(none.tree, 'wardley-title')).toEqual([]);
  });

  it('sizes the root as v12 with and without useMaxWidth, and draws the grid under showGrid', async () => {
    const wide = await render('wardley-beta\ncomponent A [0.5, 0.5]');
    const root = wide.tree.find({ tag: 'svg' })[0]!;
    expect(attr(wide.tree, root, 'width')).toBe('100%');
    expect(attr(wide.tree, root, 'style')).toMatch(/max-width:900px/);
    expect(attr(wide.tree, root, 'viewBox')).toBe('0 0 900 600');
    const [bg] = byClass(wide.tree, 'wardley-background');
    expect([0, 0, 900, 600].map(String)).toEqual(
      ['x', 'y', 'width', 'height'].map((k) => attr(wide.tree, bg, k))
    );
    const fixed = await wardleyApi({
      'wardley-beta': { useMaxWidth: false, showGrid: true },
    } as MermaidConfig);
    const { tree } = await render('wardley-beta\ncomponent A [0.5, 0.5]', fixed);
    const r = tree.find({ tag: 'svg' })[0]!;
    expect([attr(tree, r, 'width'), attr(tree, r, 'height')]).toEqual(['900', '600']);
    const [grid] = byClass(tree, 'wardley-grid');
    const lines = tree.children(grid!);
    expect(lines).toHaveLength(6);
    for (const l of lines) expect(attr(tree, l, 'stroke-dasharray')).toBe('2 6');
  });
});

/** One rendered element of each kind, by its paint attributes. */
async function paintsOf(m: Mermaid, src = probe('everything')) {
  const { tree } = await render(src, m);
  const pick = (n: SvgElement | undefined, names: string[]) =>
    Object.fromEntries(names.map((name) => [name, attr(tree, n, name)]));
  const one = (cls: string) => byClass(tree, cls)[0];
  const node = (cls: string) => byClass(tree, `wardley-node--${cls}`)[0]!;
  const childTag = (n: SvgElement, tag: string) =>
    tree.children(n).find((k) => tree.tag(k) === tag);
  // A node's own circle: the one without a class (an overlay has one).
  const [circle] = tree.find(
    (n, t) =>
      t.tag(n) === 'circle' &&
      t.getAttr(n, 'class') === undefined &&
      (t.getAttr(n.parent!, 'class') ?? '').startsWith('wardley-node ')
  );
  const divider = tree.children(one('wardley-stages')!).find((n) => tree.tag(n) === 'line');
  const [marker] = byClass(tree, 'wardley-annotation');
  const box = one('wardley-annotations-box')!;
  return {
    background: attr(tree, one('wardley-background'), 'fill'),
    axis: attr(tree, tree.children(one('wardley-axes')!)[0], 'stroke'),
    axisText: attr(tree, one('wardley-axis-label'), 'fill'),
    divider: pick(divider, ['stroke', 'stroke-dasharray', 'opacity']),
    circle: pick(circle, ['fill', 'stroke']),
    label: attr(tree, one('wardley-node-label'), 'fill'),
    anchorLabel: attr(tree, childTag(node('anchor'), 'text'), 'fill'),
    link: attr(tree, one('wardley-link'), 'stroke'),
    trend: attr(tree, one('wardley-trend'), 'stroke'),
    box: pick(childTag(box, 'rect'), ['fill', 'stroke']),
    marker: pick(childTag(marker!, 'circle'), ['fill', 'stroke']),
    markerText: attr(tree, childTag(marker!, 'text'), 'fill'),
    pipeline: pick(one('wardley-pipeline-box'), ['fill', 'stroke']),
    join: attr(tree, one('wardley-pipeline-evolution-link'), 'stroke'),
    buy: pick(one('wardley-buy-overlay'), ['fill', 'stroke']),
    accelerator: pick(childTag(one('wardley-accelerators')!, 'path'), ['fill', 'stroke']),
  };
}

const literal = (theme: MermaidConfig['theme'], extra: MermaidConfig = {}) =>
  wardleyApi({ theme, output: { cssVariables: false }, ...extra } as MermaidConfig);

describe('wardley render: paints (D215, D227, D426, D540)', () => {
  it("paints from wardley's theme table", async () => {
    const p = await paintsOf(api);
    expect(p).toMatchObject({
      background: 'var(--_wbg)',
      axis: 'var(--_wax)',
      axisText: 'var(--_wat)',
      divider: { stroke: 'var(--_wax)', 'stroke-dasharray': '5 5', opacity: '0.8' },
      circle: { fill: 'var(--_wcf)', stroke: 'var(--_wcs)' },
      label: 'var(--_wat)',
      anchorLabel: 'var(--_wat)',
      link: 'var(--_wls)',
      trend: 'var(--_wes)',
      box: { fill: 'var(--_waf)', stroke: 'var(--_was)' },
      marker: { fill: 'var(--_waf)', stroke: 'var(--_was)' },
      markerText: 'var(--_wtc)',
      pipeline: { fill: 'none', stroke: 'var(--_wax)' },
      join: 'var(--_wls)',
      buy: { fill: '#ccc', stroke: 'var(--_wcs)' },
      accelerator: { fill: 'white', stroke: 'var(--_wcs)' },
    });
    const { svg } = await render(probe('everything'));
    expect(svg).toContain('--_wes:var(--mermaid-wardleyEvolutionStroke,var(--_wec))');
    expect(svg).toContain('--_wec:var(--mermaid-wardleyEvolutionColor,#dc3545)');
    expect(svg).toContain('--_wax:var(--mermaid-wardleyAxisColor,var(--_l))');
    // No paint nothing uses: no grid without showGrid.
    expect(svg).not.toContain('--_wgr');
  });

  // v12's block (`theme-<name>.js`, spec #430 "v12 evidence"): background and fills from
  // `background` (dark: fills `mainBkg`), strokes from `lineColor`, text `primaryTextColor`,
  // evolution `#dc3545` (dark `#ff6b6b`).
  it.each([
    ['default', '#ffffff', '#333333', '#131300', '#ffffff', '#dc3545'],
    ['base', '#f4f4f4', '#0b0b0b', '#333333', '#f4f4f4', '#dc3545'],
    ['dark', '#333333', '#d3d3d3', '#e0dfdf', '#1f2020', '#ff6b6b'],
    ['forest', '#ffffff', '#000000', '#321b67', '#ffffff', '#dc3545'],
    ['neutral', '#ffffff', '#666666', '#111111', '#ffffff', '#dc3545'],
  ] as const)('draws v12 colours in %s', async (theme, bg, line, text, fill, evolution) => {
    const p = await paintsOf(await literal(theme));
    const hex = (v: string | undefined) => v?.toLowerCase();
    expect(hex(p.background)).toBe(bg);
    expect(hex(p.axis)).toBe(line);
    expect(hex(p.link)).toBe(line);
    expect(hex(p.circle.stroke)).toBe(line);
    expect(hex(p.axisText)).toBe(text);
    expect(hex(p.label)).toBe(text);
    expect(hex(p.circle.fill)).toBe(fill);
    expect(hex(p.trend)).toBe(evolution);
    // D426: anchors and dividers follow the theme, the annotation box and markers take the
    // annotation variables (white in v12, the fill here).
    expect(hex(p.anchorLabel)).toBe(text);
    expect(hex(p.divider.stroke)).toBe(line);
    expect(hex(p.box.fill)).toBe(fill);
    expect(hex(p.marker.fill)).toBe(fill);
  });

  it("keeps v12's fixed overlay and accelerator literals in every theme (D426)", async () => {
    const { tree } = await render(probe('strategies'), await literal('dark'));
    const fill = (cls: string) => attr(tree, byClass(tree, cls)[0], 'fill');
    expect(fill('wardley-build-overlay')).toBe('#eee');
    expect(attr(tree, byClass(tree, 'wardley-build-overlay')[0], 'stroke')).toBe('#000');
    expect(fill('wardley-buy-overlay')).toBe('#ccc');
    expect(fill('wardley-outsource-overlay')).toBe('#666');
    expect(fill('wardley-market-overlay')).toBe('white');
    expect(fill('wardley-market-dot')).toBe('white');
  });

  it("takes an author's flat and nested wardley variables, the flat name winning (D335, D540)", async () => {
    const m = await literal('default', {
      themeVariables: {
        wardleyAxisColor: '#111111',
        wardleyEvolutionColor: '#00ff00',
        wardley: { axisColor: '#222222', componentFill: '#333333', annotationFill: '#444444' },
      },
    } as MermaidConfig);
    const p = await paintsOf(m);
    expect(p.axis).toBe('#111111');
    expect(p.divider.stroke).toBe('#111111');
    expect(p.circle.fill).toBe('#333333');
    expect(p.box.fill).toBe('#444444');
    // `wardleyEvolutionColor` feeds `wardleyEvolutionStroke`, as in v12.
    expect(p.trend).toBe('#00ff00');
    const nested = await paintsOf(
      await literal('default', {
        themeVariables: { wardley: { evolutionStroke: '#0000ff' } },
      } as MermaidConfig)
    );
    expect(nested.trend).toBe('#0000ff');
  });

  it("moves the strokes with an author's lineColor", async () => {
    const m = await literal('forest', {
      themeVariables: { lineColor: '#ff0000' },
    } as MermaidConfig);
    const p = await paintsOf(m);
    expect([p.axis, p.link, p.circle.stroke]).toEqual(['#ff0000', '#ff0000', '#ff0000']);
  });

  it('draws text in the theme font family at v12 sizes (D422)', async () => {
    const { tree } = await render(probe('everything'));
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(attr(tree, root, 'font-family')).toBe('var(--_ff)');
    const size = (cls: string) => attr(tree, byClass(tree, cls)[0], 'font-size');
    expect([
      size('wardley-title'),
      size('wardley-axis-label'),
      size('wardley-stage-label'),
      size('wardley-node-label'),
      size('wardley-link-label'),
    ]).toEqual(['12.6', '12', '10', '10', '10']);
    expect(attr(tree, byClass(tree, 'wardley-title')[0], 'font-weight')).toBe('bold');
  });
});

describe('wardley render: accessibility, ids, security and formats', () => {
  it('names the diagram by accTitle alone, describes it by accDescr (D133)', async () => {
    const titled = await render(probe('simple'));
    const root = titled.tree.find({ tag: 'svg' })[0]!;
    expect(attr(titled.tree, root, 'aria-labelledby')).toBeUndefined();
    expect(attr(titled.tree, root, 'aria-roledescription')).toBe('wardley');
    expect(attr(titled.tree, root, 'role')).toBe('img');
    const named = await render(probe('acc-title-descr'));
    const r = named.tree.find({ tag: 'svg' })[0]!;
    expect(attr(named.tree, r, 'aria-labelledby')).toBe('x-title');
    expect(attr(named.tree, r, 'aria-describedby')).toBe('x-desc');
    expect(textOf(named.tree, named.tree.find({ tag: 'title' })[0]!)).toBe('Tea map');
    expect(textOf(named.tree, named.tree.find({ tag: 'desc' })[0]!)).toBe('How tea is made');
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = probe('acc-title-descr');
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('renders hostile labels and titles inert', async () => {
    for (const name of ['hostile-title', 'hostile-labels', 'hostile-accessibility']) {
      const { svg } = await api.render('x', probe(name));
      expect(() => assertInert(svg), name).not.toThrow();
      expect(wellFormed(svg), name).toBeUndefined();
      expect(svg, name).not.toMatch(
        /<script|<img|<style|<a |<svg [^>]*onload|="[^"]*(javascript:|url\()/
      );
    }
  });

  it('draws SVG only: ascii throws UnsupportedFormatError (D320)', async () => {
    await expect(
      api.render('x', 'wardley-beta\ncomponent A [0.5, 0.5]', { format: 'ascii' })
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
