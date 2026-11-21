import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { parseColor } from '@mermaid-js/core/theme';
import { detectTreemap, type TreemapModel, type TreemapNode } from '@mermaid-js/diagram-treemap';
import {
  MermaidError,
  UnsupportedFormatError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { treemapCases, treemapGateCorpus } from './corpus.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Render properties of the treemap renderer (spec #428 T4, DESIGN §13.2, §13.4) over the treemap
 * gate corpus (e2e fixtures, the dev diagram, v12 spec strings, the hand-written cases, each also
 * with CRLF and comment lines), through the public `render()` with `deterministic: true`, in a
 * classic, a redux and an `auto` theme: well-formed XML, the allow-list, render-twice
 * determinism, no NaN/Infinity/undefined, no `foreignObject`, `clipPath` or transform, no empty
 * `<g>`, every drawn coordinate inside the viewBox, ids only on the title and description, and
 * the AST round-trip (R-PARSE-8).
 *
 * The round-trip rule for treemap's AST: every row (section or leaf) maps to exactly one
 * `data-ast` element, its group, and the in-text title the model takes (the last non-empty one)
 * to one, its text. Rects and texts carry `data-id` only. `classDef`, the header and the
 * accessibility statements have no element; a front-matter title is drawn with no `data-ast`.
 *
 * The probes below are `corpus/treemap-cases.json`'s `treemap-cases/render-*` cases (also in
 * the gate corpus above).
 */
const THEMES = [
  'default',
  'redux-color',
  'auto',
] as const satisfies readonly MermaidConfig['theme'][];

/** The AST node types that are drawn. */
const DRAWN = new Set(['Section', 'Leaf', 'Title']);

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

beforeAll(async () => {
  api = deterministicApi();
  const corpus = await treemapGateCorpus();
  for (const theme of THEMES) {
    const themed = deterministicApi({ theme });
    for (const item of corpus) {
      if (!detectTreemap(item.source)) continue;
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

/** Every corner a rect draws at, strokes by their half width, and every text's point. */
function extents(tree: SvgView): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  const walk = (node: SvgElement): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const put = (x: number, y: number): void => void out.push({ x, y, tag: tag ?? '' });
    if (tag === 'rect') {
      const half = tree.getAttr(node, 'stroke') === undefined ? 0 : at('stroke-width') / 2;
      put(at('x') - half, at('y') - half);
      put(at('x') + at('width') + half, at('y') + at('height') + half);
    } else if (tag === 'text') put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c);
  };
  walk(tree.root);
  return out;
}

/** Every row of the model, depth first. */
const rows = (nodes: readonly TreemapNode[]): TreemapNode[] =>
  nodes.flatMap((n) => [n, ...rows(n.children)]);

describe('treemap render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(500);
    // Inputs v13 rejects are the parser's business (#484 parity); none fail to render.
    expect(skipped.filter((s) => !s.reason.startsWith('SYNTAX'))).toEqual([]);
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
    for (const theme of THEMES) fresh.set(theme, deterministicApi({ theme }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 120_000);

  it('writes no NaN, Infinity, undefined, foreignObject, clipPath or transform, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|clipPath|clip-path|transform=|overflow|<marker/
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

  it('maps every row and the in-text title to one data-ast element and back (R-PARSE-8)', () => {
    let titles = 0;
    let drawnRows = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as TreemapModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(DRAWN.has(node!.type), `${c.id}: ${id} is a ${node!.type}`).toBe(true);
        expect(tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        expect(tree.tag(el), `${c.id}: ${id}`).toBe(node!.type === 'Title' ? 'text' : 'g');
      }
      for (const row of rows(model.roots)) {
        drawnRows++;
        expect(seen.get(row.astId), `${c.id}: ${row.astId}`).toBe(1);
      }
      // Every data-id is an AST id, and the one of an element inside a group is the group's.
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-id') !== undefined))
        expect(index.has(tree.getAttr(el, 'data-id')!), c.id).toBe(true);
      if (model.titleAstId !== undefined) {
        titles++;
        expect(seen.get(model.titleAstId), c.id).toBe(1);
      }
      const drawnTitles = [...seen.keys()].filter((id) => index.get(id)!.type === 'Title');
      expect(drawnTitles.length, c.id).toBe(model.titleAstId === undefined ? 0 : 1);
    }
    expect(titles).toBeGreaterThan(0);
    expect(drawnRows).toBeGreaterThan(3000);
  });
});

const byClass = (tree: SvgView, cls: string): SvgElement[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').split(' ').includes(cls));
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
const attr = (tree: SvgView, n: SvgElement | undefined, name: string): string | undefined =>
  n && tree.getAttr(n, name as never);
const classOf = (tree: SvgView, n: SvgElement): string => attr(tree, n, 'class') ?? '';
const render = async (src: string, m: Mermaid = api) => {
  const result = await m.render('x', src);
  return { ...result, tree: parseSvg(result.svg) };
};
/** The rect of a section's or leaf's group whose label is `name`. */
function groupOf(tree: SvgView, name: string): SvgElement {
  const g = tree
    .find({ tag: 'g' })
    .find((n) => tree.children(n).some((k) => tree.tag(k) === 'text' && textOf(tree, k) === name));
  if (!g) throw new Error(`no group labelled ${name}`);
  return g;
}
const rectOf = (tree: SvgView, g: SvgElement): SvgElement =>
  tree.children(g).find((k) => /treemapSection |treemapLeaf/.test(classOf(tree, k) + ' '))!;
const box = (tree: SvgView, r: SvgElement) =>
  ['x', 'y', 'width', 'height'].map((k) => Number(attr(tree, r, k)));
/** `inner` lies inside `outer`. */
function inside(tree: SvgView, inner: SvgElement, outer: SvgElement): boolean {
  const [x, y, w, h] = box(tree, inner);
  const [X, Y, W, H] = box(tree, outer);
  return x! >= X! && y! >= Y! && x! + w! <= X! + W! && y! + h! <= Y! + H!;
}

/** A `treemap-cases/render-<name>` source from `corpus/treemap-cases.json`. */
const CASES = new Map(treemapCases().map((c) => [c.id, c.source]));
function probe(name: string): string {
  const source = CASES.get(`treemap-cases/render-${name}`);
  if (source === undefined) throw new Error(`no treemap-cases/render-${name}`);
  return source;
}

describe('treemap render: what is drawn', () => {
  it("draws v12's groups and class names: sections, then leaves, in a container", async () => {
    const { tree } = await render(probe('simple'));
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(classOf(tree, root)).toBe('mermaid mermaid-treemap');
    const [container, ...rest] = tree.children(root).filter((n) => tree.tag(n) === 'g');
    expect(rest).toEqual([]);
    expect(classOf(tree, container!)).toBe('treemapContainer');
    const groups = tree.children(container!);
    // d3's descendants() (breadth first, the hidden root's section0 left out), then leaves().
    // D403: a leaf's class is `leaf<i> <class>`, without v12's trailing `x`.
    expect(groups.map((g) => classOf(tree, g))).toEqual([
      'treemapSection',
      'treemapSection',
      'treemapSection',
      'treemapNode treemapLeafGroup leaf0',
      'treemapNode treemapLeafGroup leaf1',
      'treemapNode treemapLeafGroup leaf2',
      'treemapNode treemapLeafGroup leaf3 leafc',
    ]);
    expect(tree.children(groups[0]!).map((n) => classOf(tree, n))).toEqual([
      'treemapSectionHeader',
      'treemapSection section1',
      'treemapSectionLabel',
      'treemapSectionValue',
    ]);
    // Section 2 (45) sorts before Section 1 (24); Section 1.2 is the third section.
    expect(byClass(tree, 'treemapSectionLabel').map((n) => textOf(tree, n))).toEqual([
      'Section 2',
      'Section 1',
      'Section 1.2',
    ]);
    expect(byClass(tree, 'treemapSectionValue').map((n) => textOf(tree, n))).toEqual([
      '45',
      '24',
      '12',
    ]);
    expect(groups.slice(3).map((g) => tree.children(g).map((n) => classOf(tree, n)))).toEqual(
      Array(4).fill(['treemapLeaf', 'treemapLabel', 'treemapValue'])
    );
    // Ties keep source order, as d3's stable sort: Leaf 1.1 before Section 1.2's leaf.
    expect(byClass(tree, 'treemapLabel').map((n) => textOf(tree, n))).toEqual([
      'Leaf 2.2',
      'Leaf 2.1',
      'Leaf 1.1',
      'Leaf 1.2.1',
    ]);
  });

  it("places text at v12's anchors: section label start, value end, leaf middle", async () => {
    const { tree } = await render(probe('simple'));
    const label = byClass(tree, 'treemapSectionLabel')[0]!;
    const value = byClass(tree, 'treemapSectionValue')[0]!;
    const rect = rectOf(tree, groupOf(tree, 'Section 2'));
    const [x, y, w] = box(tree, rect);
    expect([attr(tree, label, 'x'), attr(tree, label, 'y')].map(Number)).toEqual([
      x! + 6,
      y! + 12.5,
    ]);
    expect(attr(tree, label, 'text-anchor')).toBe('start');
    expect(attr(tree, label, 'font-weight')).toBe('bold');
    expect(attr(tree, label, 'font-size')).toBe('12');
    expect(Number(attr(tree, value, 'x'))).toBe(x! + w! - 10);
    expect(attr(tree, value, 'text-anchor')).toBe('end');
    expect(attr(tree, value, 'font-style')).toBe('italic');
    expect(attr(tree, value, 'font-size')).toBe('10');
    const leafLabel = byClass(tree, 'treemapLabel')[0]!;
    const leafValue = byClass(tree, 'treemapValue')[0]!;
    expect(attr(tree, leafLabel, 'text-anchor')).toBe('middle');
    expect(attr(tree, leafLabel, 'dominant-baseline')).toBe('middle');
    expect(attr(tree, leafValue, 'dominant-baseline')).toBe('hanging');
    // 38 px fits; the value is round(38 × 0.6) = 23 px, 2 px under the label's half height.
    expect(attr(tree, leafLabel, 'font-size')).toBe('38');
    expect(attr(tree, leafValue, 'font-size')).toBe('23');
    expect(Number(attr(tree, leafValue, 'y')) - Number(attr(tree, leafLabel, 'y'))).toBe(19 + 2);
  });

  it('draws no container for an empty body, only the canvas bounds (D402)', async () => {
    const { tree, svg } = await render(CASES.get('treemap-cases/header-only')!);
    expect(byClass(tree, 'treemapContainer')).toEqual([]);
    expect(svg).not.toMatch(/NaN/);
    // v12's canvas (1000 × 400) padded by diagramPadding 8.
    expect(attr(tree, tree.find({ tag: 'svg' })[0], 'viewBox')).toBe('-8 -8 1016 416');
  });

  it('draws the in-text title with data-ast, a front-matter one without (D218)', async () => {
    const { tree, prepared } = await (async () => {
      const source = probe('titles');
      const r = await render(source);
      return { ...r, prepared: await api.prepare(source, { id: 'x' }) };
    })();
    const [title] = byClass(tree, 'treemapTitle');
    expect(textOf(tree, title!)).toBe('Budget');
    const astId = (prepared.parse.model as TreemapModel).titleAstId!;
    expect(attr(tree, title, 'data-ast')).toBe(astId);
    expect(attr(tree, title, 'text-anchor')).toBe('middle');
    expect(attr(tree, title, 'font-size')).toBe('14');
    // Below the 30 px title band, d3's top padding of the hidden root (header 25 + 10).
    expect(Number(attr(tree, rectOf(tree, groupOf(tree, 'Team')), 'y'))).toBe(30 + 35);
    const front = (await render(probe('front-matter-title'))).tree;
    const [fm] = byClass(front, 'treemapTitle');
    expect(textOf(front, fm!)).toBe('Front matter title');
    expect(attr(front, fm, 'data-ast')).toBeUndefined();
  });

  it("ports v12 utils.test.ts's hierarchies: what buildHierarchy built is what is drawn", async () => {
    // "should convert a flat array into a hierarchical structure"
    const flat = (await render(probe('utils-flat-to-tree'))).tree;
    expect(byClass(flat, 'treemapSectionLabel').map((n) => textOf(flat, n))).toEqual([
      'Root',
      'Branch 2',
      'Branch 1',
    ]);
    expect(byClass(flat, 'treemapSectionValue').map((n) => textOf(flat, n))).toEqual([
      '100',
      '75',
      '25',
    ]);
    const leavesOf: Record<string, string[]> = {
      'Branch 1': ['Leaf 1.1', 'Leaf 1.2'],
      'Branch 2': ['Leaf 2.1', 'Leaf 2.2', 'Leaf 2.3'],
    };
    const root = rectOf(flat, groupOf(flat, 'Root'));
    for (const [branch, leaves] of Object.entries(leavesOf)) {
      const b = rectOf(flat, groupOf(flat, branch));
      expect(inside(flat, b, root), branch).toBe(true);
      for (const l of leaves) expect(inside(flat, rectOf(flat, groupOf(flat, l)), b), l).toBe(true);
    }
    // "should handle empty input": nothing drawn (`header-only`, above). "should handle only root nodes": two
    // sections with no rows, which d3 lays out as leaves with no area.
    const roots = (await render(probe('utils-only-roots'))).tree;
    expect(byClass(roots, 'treemapSection')).toEqual([]);
    expect(byClass(roots, 'treemapLeafGroup').map((g) => attr(roots, g, 'data-ast'))).toEqual([
      'node:Root 1',
      'node:Root 2',
    ]);
    // "should handle complex nesting levels"
    const deep = (await render(probe('utils-complex-nesting'))).tree;
    expect(byClass(deep, 'treemapSectionLabel').map((n) => textOf(deep, n))).toEqual([
      'Root',
      'Level 1',
      'Level 2 again',
      'Level 2',
    ]);
    const level1 = rectOf(deep, groupOf(deep, 'Level 1'));
    for (const [section, leaf] of [
      ['Level 2', 'Leaf 1'],
      ['Level 2 again', 'Leaf 2'],
    ] as const) {
      const s = rectOf(deep, groupOf(deep, section));
      expect(inside(deep, s, level1), section).toBe(true);
      expect(inside(deep, rectOf(deep, groupOf(deep, leaf)), s), leaf).toBe(true);
    }
  });
});

describe('treemap render: paints (D215, D227, D404, D406, D407)', () => {
  const literal = (theme: MermaidConfig['theme'], themeVariables?: object) =>
    deterministicApi({
      theme,
      output: { cssVariables: false },
      ...(themeVariables ? { themeVariables } : {}),
    } as MermaidConfig);
  /** `paint`'s channels within 1.5 of `want` (v12 kept HSL fractions). */
  function near(paint: string | undefined, want: readonly number[]): void {
    const got = parseColor(paint ?? '');
    expect(got, paint).toBeDefined();
    for (let i = 0; i < 3; i++)
      expect(Math.abs(got![i]! - want[i]!), paint).toBeLessThanOrEqual(1.5);
  }

  it("colours sections from cScale and cScalePeer by name, leaves from their parent's cScale", async () => {
    // v12 12.2.0 `neutral`: cScale0 #555, cScale1 #F4F4F4, cScalePeer0 hsl(0, 0%, 23.33%),
    // cScalePeer1 hsl(0, 0%, 85.69%), cScaleLabel0 = cScale1.
    const { tree } = await render(probe('simple'), literal('neutral'));
    const s2 = rectOf(tree, groupOf(tree, 'Section 2'));
    expect(attr(tree, s2, 'fill')).toBe('#555555');
    near(attr(tree, s2, 'stroke'), [60, 60, 60]);
    expect(
      ['fill-opacity', 'stroke-width', 'stroke-opacity'].map((k) => attr(tree, s2, k))
    ).toEqual(['0.6', '2', '0.4']);
    const s1 = rectOf(tree, groupOf(tree, 'Section 1'));
    expect(attr(tree, s1, 'fill')).toBe('#f4f4f4');
    near(attr(tree, s1, 'stroke'), [218, 218, 218]);
    expect(attr(tree, byClass(tree, 'treemapSectionLabel')[0], 'fill')).toBe('#f4f4f4');
    // A leaf is filled and stroked at its parent's fill colour (renderer.ts:341-354).
    const leaf = rectOf(tree, groupOf(tree, 'Leaf 2.2'));
    expect([attr(tree, leaf, 'fill'), attr(tree, leaf, 'stroke')]).toEqual(['#555555', '#555555']);
    expect([attr(tree, leaf, 'fill-opacity'), attr(tree, leaf, 'stroke-width')]).toEqual([
      '0.3',
      '3',
    ]);
    // The header band has no fill and no stroke.
    const header = byClass(tree, 'treemapSectionHeader')[0]!;
    expect([attr(tree, header, 'fill'), attr(tree, header, 'stroke')]).toEqual(['none', undefined]);
  });

  it('draws top-level leaves transparent, as the hidden root takes the first colour (D404)', async () => {
    const { tree } = await render(probe('top-leaves'), literal('neutral'));
    for (const name of ['a', 'b']) {
      const r = rectOf(tree, groupOf(tree, name));
      expect([attr(tree, r, 'fill'), attr(tree, r, 'stroke')], name).toEqual([
        'transparent',
        'transparent',
      ]);
    }
    expect(attr(tree, rectOf(tree, groupOf(tree, 'c')), 'fill')).toBe('#555555');
  });

  it('gives equal names one colour, as v12 keyed its scales by name', async () => {
    const { tree } = await render(probe('shared-names'), literal('neutral'));
    const fills = byClass(tree, 'treemapSection')
      .filter((n) => tree.tag(n) === 'rect')
      .map((r) => attr(tree, r, 'fill'));
    // A (3), B (2), A (1): both A take cScale0, B cScale1.
    expect(fills).toEqual(['#555555', '#f4f4f4', '#555555']);
  });

  it('fills and strokes the 13th section and later ones, cycling cScale0 to 11 (D612, #844)', async () => {
    const { tree } = await render(probe('thirteen-sections'), literal('default'));
    const rects = byClass(tree, 'treemapSection').filter((n) => tree.tag(n) === 'rect');
    expect(rects).toHaveLength(14);
    const paints = rects.map((r) => [attr(tree, r, 'fill'), attr(tree, r, 'stroke')]);
    for (const [i, [fill, stroke]] of paints.entries()) {
      expect(fill, `section ${i + 1}`).not.toBe('transparent');
      expect(stroke, `section ${i + 1}`).not.toBe('transparent');
    }
    // Twelve colours, then round again: the 13th takes the 1st's, the 14th the 2nd's.
    expect(new Set(paints.slice(0, 12).map(([fill]) => fill)).size).toBe(12);
    expect(paints.slice(12)).toEqual(paints.slice(0, 2));
    // The 13th section's leaf takes its parent's fill.
    const leaf = rectOf(tree, groupOf(tree, 'a12'));
    expect(attr(tree, leaf, 'fill')).toBe(paints[12]![0]);
  });

  it("writes classDef styles over v12's own: shape styles on the rect, text styles on the text", async () => {
    const { tree } = await render(probe('simple'), literal('neutral'));
    const g = groupOf(tree, 'Section 1.2');
    const rect = rectOf(tree, g);
    expect([attr(tree, rect, 'fill'), attr(tree, rect, 'stroke')]).toEqual(['#ff0000', '#00ff00']);
    for (const t of tree.children(g).filter((n) => tree.tag(n) === 'text'))
      expect(attr(tree, t, 'fill')).toBe('#0000ff');
    const leaf = groupOf(tree, 'Leaf 1.2.1');
    const lr = rectOf(tree, leaf);
    expect([attr(tree, lr, 'fill'), attr(tree, lr, 'stroke-width')]).toEqual(['#ffff00', '4px']);
    for (const t of tree.children(leaf).filter((n) => tree.tag(n) === 'text')) {
      expect(attr(tree, t, 'fill')).toBe('red');
      expect(attr(tree, t, 'font-weight')).toBe('bold');
    }
  });

  it('reads cScalePeer from the theme, so an author cScalePeer<n> recolours the strokes (D406)', async () => {
    const { tree } = await render(probe('simple'), literal('neutral', { cScalePeer0: '#123456' }));
    expect(attr(tree, rectOf(tree, groupOf(tree, 'Section 2')), 'stroke')).toBe('#123456');
    const dark = (await render(probe('simple'), literal('dark'))).tree;
    // v12 dark: cScale0 #1f2020, cScalePeer0 = lighten(cScale0, 10) = hsl(180, 1.59%, 22.35%).
    near(attr(dark, rectOf(dark, groupOf(dark, 'Section 2')), 'stroke'), [56, 58, 58]);
  });

  it('draws the title at treemapTitleColor and treemapTitleFontSize, flat or nested (D407, D540)', async () => {
    const base = (await render(probe('titles'), literal('neutral'))).tree;
    const [t] = byClass(base, 'treemapTitle');
    // v12 neutral's titleColor.
    expect([attr(base, t, 'fill'), attr(base, t, 'font-size')]).toEqual(['#333333', '14']);
    const nested = (
      await render(
        probe('titles'),
        literal('neutral', { treemap: { titleColor: '#ff0000', titleFontSize: 20 } })
      )
    ).tree;
    const [n] = byClass(nested, 'treemapTitle');
    expect([attr(nested, n, 'fill'), attr(nested, n, 'font-size')]).toEqual(['#ff0000', '20']);
    const flat = (
      await render(
        probe('titles'),
        literal('neutral', {
          treemapTitleColor: '#00ff00',
          treemap: { titleColor: '#ff0000' },
        })
      )
    ).tree;
    expect(attr(flat, byClass(flat, 'treemapTitle')[0], 'fill')).toBe('#00ff00');
  });
});

describe('treemap render: accessibility, ids, security and formats', () => {
  it('names the diagram by accTitle alone, describes it by accDescr (D133)', async () => {
    const plain = await render(probe('front-matter-title'));
    const root = plain.tree.find({ tag: 'svg' })[0]!;
    expect(attr(plain.tree, root, 'aria-labelledby')).toBeUndefined();
    expect(attr(plain.tree, root, 'aria-roledescription')).toBe('treemap');
    expect(attr(plain.tree, root, 'role')).toBe('img');
    const named = await render(probe('titles'));
    const r = named.tree.find({ tag: 'svg' })[0]!;
    expect(attr(named.tree, r, 'aria-labelledby')).toBe('x-title');
    expect(attr(named.tree, r, 'aria-describedby')).toBe('x-desc');
    expect(textOf(named.tree, named.tree.find({ tag: 'title' })[0]!)).toBe('Budget by team');
    expect(textOf(named.tree, named.tree.find({ tag: 'desc' })[0]!)).toBe(
      'Spend per team and project'
    );
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = probe('titles');
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('renders hostile names and styles inert, dropping unsafe styles with a warning', async () => {
    const result = await render(probe('hostile'));
    expect(() => assertInert(result.svg)).not.toThrow();
    expect(wellFormed(result.svg)).toBeUndefined();
    expect(result.svg).not.toMatch(/<script|<img|javascript:|expression\(|url\(/);
    expect(textOf(result.tree, byClass(result.tree, 'treemapSectionLabel')[0]!)).toBe(
      '<script>alert(1)</script>'
    );
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('STYLE_VALUE_DROPPED');
    expect(codes).toContain('STYLE_PROPERTY_DROPPED');
    // The class's safe style still applies.
    expect(attr(result.tree, byClass(result.tree, 'treemapLabel')[0], 'fill')).toBe('#f00');
  });

  it('draws SVG only: ascii throws UnsupportedFormatError (D320)', async () => {
    await expect(
      api.render('x', CASES.get('treemap-cases/header-plain')!, { format: 'ascii' })
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
