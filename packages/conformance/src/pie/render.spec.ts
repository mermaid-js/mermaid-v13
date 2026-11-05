import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { detectPie, PIE_HOVER_IGNORED, type PieModel } from '@mermaid-js/diagram-pie';
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
import { pieGateCorpus } from './corpus.ts';
import { pieApi } from './render-api.ts';

/**
 * Render properties of the pie renderer (spec #288 T4, DESIGN §13.2, §13.4) over the pie gate
 * corpus (e2e fixtures, v12 spec strings, quirks and parser cases, each also with CRLF and
 * comment lines), through the public `render()` with `deterministic: true`, in a classic, a
 * redux and an `auto` theme: well-formed XML, the allow-list, render-twice determinism, no
 * NaN/Infinity/undefined, no `foreignObject`, every drawn coordinate inside the viewBox, ids
 * only on the title and description, and the AST round-trip (R-PARSE-8).
 *
 * The round-trip rule for pie's AST: every `Slice` node that is a model section maps to exactly
 * one `data-ast` element, its legend row. A `Slice` node with no section (a repeated label,
 * `slice:<label>@2`, or a negative value) is not drawn, as v12 drew nothing for it, so it maps
 * to none; its diagnostic (`PIE_DUPLICATE_SLICE`, `PIE_NEGATIVE_VALUE`) points into its range,
 * and a repeat's label is drawn by the section it repeats. The header, title and accessibility
 * statements have no element of their own, as in the other ported types.
 */
const THEMES = [
  'default',
  'redux-color',
  'auto',
] as const satisfies readonly MermaidConfig['theme'][];

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
  api = await pieApi();
  const corpus = await pieGateCorpus();
  for (const theme of THEMES) {
    const themed = await pieApi({ theme });
    for (const item of corpus) {
      if (!detectPie(item.source)) continue;
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

/** `translate(x,y)` and `scale(s,s)` of a transform, as the renderer writes them. */
function transformOf(t: string | undefined): { dx: number; dy: number; k: number } {
  const tr = t ? /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(t) : null;
  const sc = t ? /scale\((-?[\d.]+)(?:,(-?[\d.]+))?\)/.exec(t) : null;
  return { dx: tr ? Number(tr[1]) : 0, dy: tr ? Number(tr[2]) : 0, k: sc ? Number(sc[1]) : 1 };
}

/** Every coordinate an element draws at, in root user units; arcs count by their bulges. */
function extents(tree: SvgView): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  const walk = (node: SvgElement, x0: number, y0: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const { dx, dy, k } = transformOf(tree.getAttr(node, 'transform'));
    // A scale is written on a leaf only (the highlighted slice), after any translate.
    const put = (x: number, y: number): void =>
      void out.push({ x: x0 + dx + k * x, y: y0 + dy + k * y, tag: tag ?? '' });
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle') {
      const r = at('r') + at('stroke-width') / 2;
      put(at('cx') - r, at('cy') - r);
      put(at('cx') + r, at('cy') + r);
    } else if (tag === 'path') {
      for (const p of pathPoints(tree.getAttr(node, 'd') ?? '')) put(p.x, p.y);
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c, x0 + dx, y0 + dy);
  };
  walk(tree.root, 0, 0);
  return out;
}

describe('pie render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(400);
    // Inputs v13 rejects are the parser's business (#305 parity); none fail to render.
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
    for (const theme of THEMES) fresh.set(theme, await pieApi({ theme }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 120_000);

  it('writes no NaN, Infinity or undefined, no foreignObject, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
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

  it('maps every section to one data-ast element and back; dropped slices to none', () => {
    let dropped = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as PieModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.type, `${c.id}: ${id}`).toBe('Slice');
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
        expect(c.source.slice(node!.range.start, node!.range.end), `${c.id}: ${id}`).toMatch(
          /^["']/
        );
      }
      const sections = new Set(model.sections.map((s) => s.astId));
      for (const s of model.sections) expect(seen.get(s.astId), `${c.id}: ${s.astId}`).toBe(1);
      for (const node of parse.ast.children ?? []) {
        if (node.type !== 'Slice' || sections.has(node.id)) continue;
        dropped++;
        expect(seen.get(node.id), `${c.id}: ${node.id}`).toBeUndefined();
        const why = parse.diagnostics.filter(
          (d) =>
            (d.code === 'PIE_DUPLICATE_SLICE' || d.code === 'PIE_NEGATIVE_VALUE') &&
            d.range.start >= node.range.start &&
            d.range.end <= node.range.end
        );
        expect(why.length, `${c.id}: ${node.id} has no diagnostic`).toBeGreaterThan(0);
      }
    }
    // The corpus has repeated labels (negative values are rejected, so never rendered).
    expect(dropped).toBeGreaterThan(0);
  });
});

const slices = (tree: SvgView): SvgElement[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').split(' ').includes('pieCircle'));
const legendRows = (tree: SvgView): SvgElement[] => tree.find({ tag: 'g', class: 'legend' });
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');

describe('pie render: what is drawn', () => {
  it('draws slices in input order, a hidden slice keeping its colour slot (pieRenderer.spec)', async () => {
    const { svg } = await api.render('x', 'pie\n"A": 10\n"B": 100\n"C": 0.1\n"D": 50');
    const tree = parseSvg(svg);
    const drawn = slices(tree);
    expect(drawn.map((n) => tree.getAttr(n, 'data-id'))).toEqual(['slice:A', 'slice:B', 'slice:D']);
    const rows = legendRows(tree);
    expect(rows.map((n) => tree.getAttr(n, 'data-ast'))).toEqual([
      'slice:A',
      'slice:B',
      'slice:C',
      'slice:D',
    ]);
    // D is the fourth colour: its slice is filled like its own legend swatch, not C's.
    const swatch = (i: number): string | undefined =>
      tree.getAttr(rows[i]!.children.find((c) => c.tag === 'rect')!, 'fill');
    expect(tree.getAttr(drawn[2]!, 'fill')).toBe(swatch(3));
    expect(swatch(3)).not.toBe(swatch(2));
    // The hidden slice still has its legend row, and no percentage.
    expect(textOf(tree, rows[2]!)).toBe('C');
    expect(tree.find({ tag: 'text', class: 'slice' }).map((n) => textOf(tree, n))).toEqual([
      '6%',
      '62%',
      '31%',
    ]);
  });

  it('takes colour slot = section index mod 12', async () => {
    const src = ['pie', ...Array.from({ length: 14 }, (_, i) => `"s${i}": 1`)].join('\n');
    const tree = parseSvg((await api.render('x', src)).svg);
    const fills = slices(tree).map((n) => tree.getAttr(n, 'fill'));
    expect(new Set(fills.slice(0, 12)).size).toBe(12);
    expect(fills[12]).toBe(fills[0]);
    expect(fills[13]).toBe(fills[1]);
  });

  it('draws a named highlightSlice at scale 1.05, opaque (D222)', async () => {
    const src = '---\nconfig:\n  pie:\n    highlightSlice: B\n---\npie\n"A": 1\n"B": 2';
    const { svg, warnings } = await api.render('x', src);
    const tree = parseSvg(svg);
    const [a, b] = slices(tree);
    expect(tree.getAttr(b!, 'class')).toBe('pieCircle highlighted');
    expect(tree.getAttr(b!, 'transform')).toBe('scale(1.05,1.05)');
    expect(tree.getAttr(b!, 'opacity')).toBe('1');
    expect(tree.getAttr(a!, 'class')).toBe('pieCircle');
    expect(tree.getAttr(a!, 'transform')).toBeUndefined();
    expect(tree.getAttr(a!, 'opacity')).toBe('0.7');
    expect(warnings.filter((w) => w.code === PIE_HOVER_IGNORED)).toEqual([]);
  });

  it('accepts highlightSlice hover, draws nothing extra and warns once (D222)', async () => {
    const src = '%%{init: {"pie": {"highlightSlice": "hover"}}}%%\npie\n"A": 1\n"hover": 2';
    const { svg, warnings } = await api.render('x', src);
    const tree = parseSvg(svg);
    for (const s of slices(tree)) {
      expect(tree.getAttr(s, 'class')).toBe('pieCircle highlightedOnHover');
      expect(tree.getAttr(s, 'transform')).toBeUndefined();
      expect(tree.getAttr(s, 'opacity')).toBe('0.7');
    }
    expect(warnings.filter((w) => w.code === PIE_HOVER_IGNORED)).toHaveLength(1);
  });

  it('draws the outer circle, title and legend with no sections or a zero sum', async () => {
    for (const src of ['pie title Nothing', 'pie title Zero\n"a": 0\n"b": 0']) {
      const { svg } = await api.render('x', src);
      const tree = parseSvg(svg);
      expect(tree.find({ tag: 'circle', class: 'pieOuterCircle' }), src).toHaveLength(1);
      expect(slices(tree), src).toEqual([]);
      expect(textOf(tree, tree.find({ tag: 'text', class: 'pieTitleText' })[0]!)).toMatch(
        /Nothing|Zero/
      );
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });

  it('cuts the donut hole out of every slice', async () => {
    const src = '%%{init: {"pie": {"donutHole": 0.5}}}%%\npie\n"a": 1\n"b": 1';
    const tree = parseSvg((await api.render('x', src)).svg);
    // Outer arc, a line in, the inner arc back: two arcs per slice.
    for (const s of slices(tree)) expect((tree.getAttr(s, 'd') ?? '').match(/A/g)).toHaveLength(2);
  });

  it('prints values under showData, and the front-matter title when the text has none (D218)', async () => {
    const tree = parseSvg(
      (await api.render('x', '---\ntitle: Front\n---\npie showData\n"Dogs": 50')).svg
    );
    expect(textOf(tree, legendRows(tree)[0]!)).toBe('Dogs [50]');
    expect(textOf(tree, tree.find({ tag: 'text', class: 'pieTitleText' })[0]!)).toBe('Front');
  });

  it('sizes the root as v12 with and without useMaxWidth', async () => {
    const wide = parseSvg((await api.render('x', 'pie\n"a": 1')).svg);
    const root = wide.find({ tag: 'svg' })[0]!;
    expect(wide.getAttr(root, 'width')).toBe('100%');
    expect(wide.getAttr(root, 'style')).toMatch(/max-width:\d+px/);
    const src = '%%{init: {"pie": {"useMaxWidth": false}}}%%\npie\n"a": 1';
    const fixed = parseSvg((await api.render('x', src)).svg);
    const r = fixed.find({ tag: 'svg' })[0]!;
    const [, , w, h] = fixed.getAttr(r, 'viewBox')!.split(' ').map(Number);
    expect([fixed.getAttr(r, 'width'), fixed.getAttr(r, 'height')]).toEqual([String(w), String(h)]);
  });

  it('paints from the pie theme variables (#325): strokes, opacity, texts', async () => {
    const tree = parseSvg((await api.render('x', 'pie title T\n"a": 1')).svg);
    const [s] = slices(tree);
    expect(tree.getAttr(s!, 'fill')).toBe('var(--_pi1)');
    expect(tree.getAttr(s!, 'stroke')).toBe('var(--_pkc)');
    expect(tree.getAttr(s!, 'stroke-width')).toBe('2');
    expect(tree.getAttr(s!, 'opacity')).toBe('0.7');
    const outer = tree.find({ tag: 'circle', class: 'pieOuterCircle' })[0]!;
    expect([tree.getAttr(outer, 'stroke'), tree.getAttr(outer, 'fill')]).toEqual([
      'var(--_poc)',
      'none',
    ]);
    const title = tree.find({ tag: 'text', class: 'pieTitleText' })[0]!;
    expect(tree.getAttr(title, 'fill')).toBe('var(--_ptc)');
    expect(tree.getAttr(title, 'font-size')).toBe('25');
    expect(tree.getAttr(tree.find({ tag: 'text', class: 'slice' })[0]!, 'fill')).toBe(
      'var(--_psc)'
    );
  });

  it('takes the theme’s values and an author’s pie variables (#325)', async () => {
    const config = {
      theme: 'dark',
      output: { cssVariables: false },
      themeVariables: { pie2: '#123456', pieOpacity: 0.4, pieStrokeWidth: 5, pieTitleTextSize: 30 },
    } as const;
    const m = await pieApi(config as MermaidConfig);
    const tree = parseSvg((await m.render('x', 'pie title T\n"a": 1\n"b": 1')).svg);
    const [a, b] = slices(tree);
    // dark takes v12's off-by-one cScale: slot 1 is cScale1.
    expect(tree.getAttr(a!, 'fill')).toBe('#0b0000');
    expect(tree.getAttr(b!, 'fill')).toBe('#123456');
    expect(tree.getAttr(a!, 'opacity')).toBe('0.4');
    expect(tree.getAttr(a!, 'stroke-width')).toBe('5');
    const title = tree.find({ tag: 'text', class: 'pieTitleText' })[0]!;
    expect([tree.getAttr(title, 'fill'), tree.getAttr(title, 'font-size')]).toEqual([
      'lightgrey',
      '30',
    ]);
  });
});

describe('pie render: accessibility, ids, security and formats', () => {
  it('names the diagram by accTitle alone, describes it by accDescr (D133)', async () => {
    const titled = parseSvg((await api.render('m', 'pie title Visible\n"a": 1')).svg);
    const root = titled.find({ tag: 'svg' })[0]!;
    expect(titled.getAttr(root, 'aria-labelledby')).toBeUndefined();
    expect(titled.getAttr(root, 'aria-roledescription')).toBe('pie');
    const src = 'pie\naccTitle: Pets\naccDescr {\n  Owned pets\n}\n"a": 1';
    const named = parseSvg((await api.render('m', src)).svg);
    const r = named.find({ tag: 'svg' })[0]!;
    expect(named.getAttr(r, 'aria-labelledby')).toBe('m-title');
    expect(named.getAttr(r, 'aria-describedby')).toBe('m-desc');
    expect(textOf(named, named.find({ tag: 'title' })[0]!)).toBe('Pets');
    expect(textOf(named, named.find({ tag: 'desc' })[0]!)).toBe('Owned pets');
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'pie\n  accTitle: T\n  accDescr: D\n  "a": 1';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('renders hostile labels and titles inert', async () => {
    const hostile = [
      'pie title </text><script>alert(1)</script>\n"a": 1',
      'pie\n"<img src=x onerror=alert(1)>": 1\n"<svg onload=alert(1)>": 2',
      'pie\naccTitle: <script>x</script>\naccDescr: ]]><x\n"&<>\'": 1',
      'pie\n"\\u0000\\0\\b": 1',
    ];
    for (const source of hostile) {
      const { svg } = await api.render('x', source);
      expect(() => assertInert(svg), source).not.toThrow();
      expect(wellFormed(svg), source).toBeUndefined();
      expect(svg, source).not.toMatch(/<script|<img|<svg [^>]*onload|="[^"]*(javascript:|url\()/);
    }
  });

  it('draws SVG only: ascii throws UnsupportedFormatError (D216)', async () => {
    await expect(api.render('x', 'pie\n"a": 1', { format: 'ascii' })).rejects.toBeInstanceOf(
      UnsupportedFormatError
    );
  });
});
