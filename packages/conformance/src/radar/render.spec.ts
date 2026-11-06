import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { detectRadar, type RadarModel } from '@mermaid-js/diagram-radar';
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
import { radarGateCorpus } from './corpus.ts';
import { radarApi } from './render-api.ts';

/**
 * Render properties of the radar renderer (spec #422 T4, DESIGN §13.2, §13.4) over the radar
 * gate corpus (e2e fixtures, the dev diagram, v12 spec strings, the hand-written cases, each also
 * with CRLF and comment lines), through the public `render()` with `deterministic: true`, in a
 * classic, a redux and an `auto` theme: well-formed XML, the allow-list, render-twice
 * determinism, no NaN/Infinity/undefined, no `foreignObject` or `overflow`, no empty `<g>`,
 * every drawn coordinate inside the viewBox, ids only on the title and description, and the AST
 * round-trip (R-PARSE-8).
 *
 * The round-trip rule for radar's AST: every model axis maps to exactly one `data-ast` element
 * (its `<g>`), every drawn curve to one (its shape), and the in-text title to one. A curve
 * whose entry count is not the axis count is not drawn (v12 skipped it), so it maps to none and
 * `RADAR_CURVE_SKIPPED` names it. Entries, options, the header and the accessibility statements
 * have no element of their own; a front-matter title is drawn with no `data-ast`.
 */
const THEMES = [
  'default',
  'redux-color',
  'auto',
] as const satisfies readonly MermaidConfig['theme'][];

/** The AST node types that are drawn. */
const DRAWN = new Set(['Axis', 'Curve', 'Title']);

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
  api = await radarApi();
  const corpus = await radarGateCorpus();
  for (const theme of THEMES) {
    const themed = await radarApi({ theme });
    for (const item of corpus) {
      if (!detectRadar(item.source)) continue;
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
    expect(tree.getAttr(node, 'transform'), 'radar writes no transform').toBeUndefined();
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const half = at('stroke-width') / 2;
    const put = (x: number, y: number, r = 0): void => {
      out.push({ x: x - r, y: y - r, tag: tag ?? '' });
      out.push({ x: x + r, y: y + r, tag: tag ?? '' });
    };
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle') put(at('cx'), at('cy'), at('r') + half);
    else if (tag === 'line') {
      put(at('x1'), at('y1'), half);
      put(at('x2'), at('y2'), half);
    } else if (tag === 'polygon') {
      const n = (tree.getAttr(node, 'points') ?? '').split(/[ ,]+/).filter(Boolean).map(Number);
      for (let i = 0; i + 1 < n.length; i += 2) put(n[i]!, n[i + 1]!, half);
    } else if (tag === 'path') {
      for (const p of pathPoints(tree.getAttr(node, 'd') ?? '')) put(p.x, p.y, half);
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c);
  };
  walk(tree.root);
  return out;
}

describe('radar render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(400);
    // Inputs v13 rejects are the parser's business (#446 parity); none fail to render.
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
    for (const theme of THEMES) fresh.set(theme, await radarApi({ theme }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 120_000);

  it('writes no NaN, Infinity, undefined, foreignObject or overflow, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|overflow|<marker/
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

  it('keeps every drawn coordinate inside the viewBox (D354)', () => {
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

  it('maps every axis, drawn curve and in-text title to one data-ast element and back', () => {
    let skippedCurves = 0;
    let titles = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as RadarModel;
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
      for (const a of model.axes) expect(seen.get(a.astId), `${c.id}: ${a.astId}`).toBe(1);
      const skippedIds = c.result.warnings
        .filter((w) => w.code === 'RADAR_CURVE_SKIPPED')
        .flatMap((w) => w.astIds ?? []);
      for (const curve of model.curves) {
        const drawn = curve.entries.length === model.axes.length && model.axes.length > 0;
        expect(seen.get(curve.astId), `${c.id}: ${curve.astId}`).toBe(drawn ? 1 : undefined);
        if (!drawn) {
          skippedCurves++;
          expect(skippedIds, `${c.id}: ${curve.astId}`).toContain(curve.astId);
        }
      }
      if (model.titleAstId !== undefined) {
        titles++;
        expect(seen.get(model.titleAstId), c.id).toBe(1);
        expect(index.get(model.titleAstId)!.type, c.id).toBe('Title');
      }
      const drawnIds = [...seen.keys()].filter((id) => index.get(id)!.type === 'Title');
      expect(drawnIds.length, c.id).toBe(model.titleAstId === undefined ? 0 : 1);
    }
    expect(skippedCurves).toBeGreaterThan(0);
    expect(titles).toBeGreaterThan(0);
  });
});

const byClass = (tree: SvgView, cls: string): SvgElement[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').split(' ').includes(cls));
const prefixed = (tree: SvgView, prefix: string): SvgElement[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').startsWith(prefix));
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
const attr = (tree: SvgView, n: SvgElement | undefined, name: string): string | undefined =>
  n && tree.getAttr(n, name as never);
const render = async (src: string, m: Mermaid = api) => {
  const result = await m.render('x', src);
  return { ...result, tree: parseSvg(result.svg) };
};

const SIMPLE = 'radar-beta\ntitle T\naxis A, B, C\ncurve c{1, 2, 3}\ncurve d{3, 2, 1}';

describe('radar render: what is drawn', () => {
  it('draws in v12 order: rings, axes, curves, legend, title', async () => {
    const { tree } = await render(SIMPLE);
    const root = tree.find({ tag: 'svg' })[0]!;
    const kinds = tree.children(root).map((n) => {
      const cls = attr(tree, n, 'class') ?? '';
      if (tree.tag(n) === 'g')
        return tree.children(n).some((k) => attr(tree, k, 'class') === 'radarAxisLine')
          ? 'axis'
          : 'legend';
      return cls.replace(/-\d+$/, '');
    });
    expect(kinds).toEqual([
      ...Array<string>(5).fill('radarGraticule'),
      'axis',
      'axis',
      'axis',
      'radarCurve',
      'radarCurve',
      'legend',
      'legend',
      'radarTitle',
    ]);
    const axis = tree.find({ tag: 'g' })[0]!;
    expect(tree.children(axis).map((n) => attr(tree, n, 'class'))).toEqual([
      'radarAxisLine',
      'radarAxisLabel',
    ]);
    const row = tree.find({ tag: 'g' })[3]!;
    expect(tree.children(row).map((n) => attr(tree, n, 'class'))).toEqual([
      'radarLegendBox-0',
      'radarLegendText',
    ]);
    expect(attr(tree, row, 'data-id')).toBe('curve:c');
    expect(attr(tree, row, 'data-ast')).toBeUndefined();
    expect(attr(tree, tree.children(row)[0], 'data-ast')).toBeUndefined();
  });

  it('skips a curve with the wrong entry count, keeping its slot and legend row (D356)', async () => {
    const { tree, warnings } = await render(
      'radar-beta\naxis A, B\ncurve a{1, 2}\ncurve b{1}\ncurve c{2, 1}'
    );
    const curves = prefixed(tree, 'radarCurve-');
    expect(curves.map((n) => attr(tree, n, 'class'))).toEqual(['radarCurve-0', 'radarCurve-2']);
    expect(curves.map((n) => attr(tree, n, 'data-ast'))).toEqual(['curve:a', 'curve:c']);
    const boxes = prefixed(tree, 'radarLegendBox-');
    expect(boxes.map((n) => attr(tree, n, 'class'))).toEqual([
      'radarLegendBox-0',
      'radarLegendBox-1',
      'radarLegendBox-2',
    ]);
    expect(attr(tree, curves[1], 'fill')).toBe(attr(tree, boxes[2], 'fill'));
    expect(attr(tree, boxes[1], 'fill')).not.toBe(attr(tree, boxes[2], 'fill'));
    expect(warnings.filter((w) => w.code === 'RADAR_CURVE_SKIPPED')).toMatchObject([
      { astIds: ['curve:b'] },
    ]);
  });

  it('takes colour slot = curve index mod 12 (D353)', async () => {
    const src = [
      'radar-beta',
      'axis A, B',
      ...Array.from({ length: 14 }, (_, i) => `curve c${i}{1, 2}`),
    ].join('\n');
    const { tree } = await render(src);
    const curves = prefixed(tree, 'radarCurve-');
    expect(curves.map((n) => attr(tree, n, 'class')).slice(11)).toEqual([
      'radarCurve-11',
      'radarCurve-0',
      'radarCurve-1',
    ]);
    const fills = curves.map((n) => attr(tree, n, 'fill'));
    expect(new Set(fills.slice(0, 12)).size).toBe(12);
    expect(fills[12]).toBe(fills[0]);
    expect(fills[13]).toBe(fills[1]);
  });

  it('draws polygons under graticule polygon, and no ring without axes', async () => {
    const { tree } = await render(
      'radar-beta\naxis A, B, C\ncurve c{1, 2, 3}\ngraticule polygon\nticks 3'
    );
    expect(tree.find({ tag: 'polygon', class: 'radarGraticule' })).toHaveLength(3);
    expect(tree.find({ tag: 'circle' })).toEqual([]);
    const [curve] = prefixed(tree, 'radarCurve-');
    expect(tree.tag(curve!)).toBe('polygon');
    expect(attr(tree, curve, 'points')!.split(/[ ,]+/)).toHaveLength(6);
    const bare = await render('radar-beta\ngraticule polygon\ntitle Nothing');
    expect(bare.tree.find({ tag: 'polygon' })).toEqual([]);
    expect(bare.svg).not.toMatch(/points=""/);
  });

  it('draws v12 rings for ticks 0, fractional and over 32 (clamped with a warning)', async () => {
    const rings = async (ticks: string) =>
      (await render(`radar-beta\naxis A, B\ncurve c{1, 2}\nticks ${ticks}`)).tree.find({
        tag: 'circle',
        class: 'radarGraticule',
      });
    expect(await rings('0')).toEqual([]);
    expect(await rings('2.5')).toHaveLength(3);
    const many = await render('radar-beta\naxis A, B\ncurve c{1, 2}\nticks 40');
    expect(many.tree.find({ tag: 'circle' })).toHaveLength(32);
    expect(many.warnings.map((w) => w.code)).toContain('RADAR_TICKS_CLAMPED');
  });

  it('draws max = min at the centre with one warning, no NaN (D356)', async () => {
    const { svg, warnings } = await render('radar-beta\naxis A, B\ncurve c{1, 1}\nmax 1\nmin 1');
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(warnings.filter((w) => w.code === 'RADAR_EMPTY_RANGE')).toHaveLength(1);
  });

  it('draws no legend under showLegend false', async () => {
    const { tree } = await render('radar-beta\naxis A\ncurve c{1}\nshowLegend false');
    expect(prefixed(tree, 'radarLegendBox-')).toEqual([]);
    expect(byClass(tree, 'radarLegendText')).toEqual([]);
  });

  it('draws the in-text title with data-ast, a front-matter one without (D218)', async () => {
    const own = await render('radar-beta\ntitle First\ntitle Last\naxis A');
    const [t] = byClass(own.tree, 'radarTitle');
    expect(textOf(own.tree, t!)).toBe('Last');
    expect(attr(own.tree, t, 'data-ast')).toBe('title@2');
    const front = await render('---\ntitle: Front\n---\nradar-beta\naxis A');
    const [f] = byClass(front.tree, 'radarTitle');
    expect(textOf(front.tree, f!)).toBe('Front');
    expect(attr(front.tree, f, 'data-ast')).toBeUndefined();
    const none = await render('radar-beta\naxis A');
    expect(byClass(none.tree, 'radarTitle')).toEqual([]);
  });

  it('breaks <br> and newlines in labels, legend and title into lines (D355)', async () => {
    const { tree } = await render(
      'radar-beta\ntitle One<br>Two\naxis A["a<br>b"], B\ncurve c["x<br/>y"]{1, 2}'
    );
    for (const cls of ['radarTitle', 'radarAxisLabel', 'radarLegendText']) {
      const [n] = byClass(tree, cls);
      expect(tree.children(n!).filter((k) => tree.tag(k) === 'tspan').length, cls).toBe(2);
    }
  });

  it('sizes the root as v12 with and without useMaxWidth', async () => {
    const wide = await render('radar-beta\naxis A');
    const root = wide.tree.find({ tag: 'svg' })[0]!;
    expect(attr(wide.tree, root, 'width')).toBe('100%');
    expect(attr(wide.tree, root, 'style')).toMatch(/max-width:700px/);
    expect(attr(wide.tree, root, 'viewBox')).toBe('0 0 700 700');
    const src = '%%{init: {"radar": {"useMaxWidth": false}}}%%\nradar-beta\naxis A';
    const fixed = await render(src);
    const r = fixed.tree.find({ tag: 'svg' })[0]!;
    const [, , w, h] = attr(fixed.tree, r, 'viewBox')!.split(' ').map(Number);
    expect([attr(fixed.tree, r, 'width'), attr(fixed.tree, r, 'height')]).toEqual([
      String(w),
      String(h),
    ]);
  });
});

/** One rendered element of each class, by its paint attributes. */
async function paintsOf(m: Mermaid, src = SIMPLE) {
  const { tree } = await render(src, m);
  const one = (cls: string) => byClass(tree, cls)[0];
  const pick = (cls: string, names: string[]) =>
    Object.fromEntries(names.map((name) => [name, attr(tree, one(cls), name)]));
  const shape = ['fill', 'fill-opacity', 'stroke', 'stroke-width'];
  return {
    graticule: pick('radarGraticule', shape),
    axis: pick('radarAxisLine', ['stroke', 'stroke-width']),
    label: pick('radarAxisLabel', ['fill', 'font-size']),
    curve0: pick('radarCurve-0', shape),
    curve1: pick('radarCurve-1', shape),
    box0: {
      ...pick('radarLegendBox-0', shape),
      width: attr(tree, one('radarLegendBox-0'), 'width'),
    },
    legend: pick('radarLegendText', ['fill', 'font-size']),
    title: pick('radarTitle', ['fill', 'font-size', 'font-weight']),
  };
}

const literal = (theme: MermaidConfig['theme'], extra: MermaidConfig = {}) =>
  radarApi({ theme, output: { cssVariables: false }, ...extra } as MermaidConfig);

describe('radar render: paints (D215, D227, D351–D353, D359)', () => {
  it("paints from radar's theme table, the cScale palette and textColor", async () => {
    const p = await paintsOf(api);
    expect(p.graticule).toEqual({
      fill: 'var(--_rgc)',
      'fill-opacity': '0.3',
      stroke: 'var(--_rgc)',
      'stroke-width': '1',
    });
    expect(p.axis).toEqual({ stroke: 'var(--_rda)', 'stroke-width': '2' });
    expect(p.label).toEqual({ fill: 'var(--_tx)', 'font-size': '12' });
    expect(p.legend).toEqual({ fill: 'var(--_tx)', 'font-size': '12' });
    // v13's default theme is redux-color: its fontSize, and its cScale0 as a literal (D258).
    expect(p.title).toEqual({ fill: 'var(--_tx)', 'font-size': '14', 'font-weight': undefined });
    expect(p.curve0).toEqual({
      fill: '#f4a8ff',
      'fill-opacity': '0.5',
      stroke: '#f4a8ff',
      'stroke-width': '2',
    });
    // The swatch: v12's default stroke width, the curve's fill opacity, 12 px (D359).
    expect(p.box0).toEqual({ ...p.curve0, 'stroke-width': undefined, width: '12' });
    const { svg } = await render(SIMPLE);
    expect(svg).toContain('--_rda:var(--mermaid-radarAxisColor,var(--_l))');
    expect(svg).toContain('--_rgc:var(--mermaid-radarGraticuleColor,#DEDEDE)');
  });

  it("takes an author's flat and nested radar variables, the flat name winning (D335, D540)", async () => {
    const m = await literal('default', {
      themeVariables: {
        radarAxisColor: '#111111',
        radarCurveOpacity: 0.25,
        cScale0: '#abcdef',
        radar: {
          axisColor: '#222222',
          legendBoxSize: 20,
          graticuleColor: '#333333',
          graticuleOpacity: 0.6,
          curveStrokeWidth: 4,
          axisLabelFontSize: 15,
        },
      },
    } as MermaidConfig);
    const p = await paintsOf(m);
    expect(p.axis.stroke).toBe('#111111');
    expect(p.graticule).toMatchObject({ fill: '#333333', 'fill-opacity': '0.6' });
    expect(p.curve0).toEqual({
      fill: '#abcdef',
      'fill-opacity': '0.25',
      stroke: '#abcdef',
      'stroke-width': '4',
    });
    expect(p.box0.width).toBe('20');
    expect(p.label['font-size']).toBe('15');
  });

  it("moves the axes with an author's lineColor (D351)", async () => {
    const m = await literal('forest', {
      themeVariables: { lineColor: '#ff0000' },
    } as MermaidConfig);
    expect((await paintsOf(m)).axis.stroke).toBe('#ff0000');
  });

  // Pitfall 17: v12 12.2.0's computed styles, probed in Chromium (`getComputedStyle`) over this
  // chart with `look: 'neo'` and with `look: 'classic'`: the same values (v12's neo selectors match
  // no radar element, D227). v13 draws them, but the axes take the theme's own `lineColor`
  // (`#000000`, `#cccccc`) where v12 fell back to theme-default's `#333333` (D333(b)).
  it.each([
    ['neo', '#000000', '#7373f8', '#9b9bbf', '#333333', '14'],
    ['neo-dark', '#cccccc', '#000000', '#080909', '#cccccc', '14'],
  ] as const)('draws v12 computed styles in %s', async (theme, axis, c0, c1, text, title) => {
    const p = await paintsOf(await literal(theme, { look: 'neo' } as MermaidConfig));
    expect(p.graticule).toEqual({
      fill: '#DEDEDE',
      'fill-opacity': '0.3',
      stroke: '#DEDEDE',
      'stroke-width': '1',
    });
    expect(p.axis).toEqual({ stroke: axis, 'stroke-width': '2' });
    expect(p.curve0).toEqual({ fill: c0, 'fill-opacity': '0.5', stroke: c0, 'stroke-width': '2' });
    expect(p.curve1.fill).toBe(c1);
    expect(p.box0).toEqual({ ...p.curve0, 'stroke-width': undefined, width: '12' });
    expect(p.label).toEqual({ fill: text, 'font-size': '12' });
    expect(p.legend).toEqual({ fill: text, 'font-size': '12' });
    expect(p.title).toEqual({ fill: text, 'font-size': title, 'font-weight': undefined });
  });
});

describe('radar render: accessibility, ids, security and formats', () => {
  it('names the diagram by accTitle alone, describes it by accDescr (D133)', async () => {
    const titled = await render('radar-beta\ntitle Visible\naxis A');
    const root = titled.tree.find({ tag: 'svg' })[0]!;
    expect(attr(titled.tree, root, 'aria-labelledby')).toBeUndefined();
    expect(attr(titled.tree, root, 'aria-roledescription')).toBe('radar');
    expect(attr(titled.tree, root, 'role')).toBe('img');
    const named = await render('radar-beta\naccTitle: Skills\naccDescr {\n  Two axes\n}\naxis A');
    const r = named.tree.find({ tag: 'svg' })[0]!;
    expect(attr(named.tree, r, 'aria-labelledby')).toBe('x-title');
    expect(attr(named.tree, r, 'aria-describedby')).toBe('x-desc');
    expect(textOf(named.tree, named.tree.find({ tag: 'title' })[0]!)).toBe('Skills');
    expect(textOf(named.tree, named.tree.find({ tag: 'desc' })[0]!)).toBe('Two axes');
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'radar-beta\n  accTitle: T\n  accDescr: D\n  axis A';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('renders hostile labels and titles inert', async () => {
    const hostile = [
      'radar-beta\ntitle </text><script>alert(1)</script>\naxis A',
      'radar-beta\naxis A["<img src=x onerror=alert(1)>"], B["<svg onload=alert(1)>"]\ncurve c["<script>x</script>"]{1, 2}',
      'radar-beta\naccTitle: <script>x</script>\naccDescr: ]]><x\naxis A["&<>\'"]',
      'radar-beta\naxis A["\\u0000\\0\\b"]\ncurve c["javascript:alert(1)"]{1}',
    ];
    for (const source of hostile) {
      const { svg } = await api.render('x', source);
      expect(() => assertInert(svg), source).not.toThrow();
      expect(wellFormed(svg), source).toBeUndefined();
      expect(svg, source).not.toMatch(/<script|<img|<svg [^>]*onload|="[^"]*(javascript:|url\()/);
    }
  });

  it('draws SVG only: ascii throws UnsupportedFormatError (D320)', async () => {
    await expect(api.render('x', 'radar-beta\naxis A', { format: 'ascii' })).rejects.toBeInstanceOf(
      UnsupportedFormatError
    );
  });
});
