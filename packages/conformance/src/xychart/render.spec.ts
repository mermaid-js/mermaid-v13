import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import {
  renderXyChartForTest,
  XYCHART_PARSE_ERROR,
  type RenderedXyChart,
} from '@mermaid-js/diagram-xychart/testing';
import { detectXyChart } from '@mermaid-js/diagram-xychart';
import { MermaidError } from 'mermaid';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { xyChartCases, xyChartCorpus } from './corpus.ts';
import { xyChartApi } from './render-api.ts';

/**
 * Render properties and the AST round-trip of the XY chart (spec #426 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page
 * strings and the parser cases and recovery set, each in every theme and `theme: 'auto'` set as
 * `initialize()` would (a source's own front matter and directives still win). Sources go through
 * the plugin's own seam, parse → layout → render, with core's render context
 * (`renderXyChartForTest`), which also hands back the model and layout the properties read;
 * sources the parser rejects stay out. The public `render()` through the registry row (#513)
 * writes the same bytes for every case, and rejects exactly the sources the parser rejects.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject`, ids only `<prefix>-title`/`-desc`, every drawn coordinate (rects, paths, text
 * anchors) inside the viewBox, every alias declared, and only the XY chart's warning codes.
 * Round-trip: each drawn `Plot`, `Axis` and in-text `Title` of the AST has exactly one
 * `data-ast` element (its group), nothing else has one, and every `data-id` names a plot.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;
const PREFIX = 'xy-0';
const WARNINGS = new Set([
  'XYCHART_MISSING_VALUE',
  'XYCHART_EMPTY_RANGE',
  'XYCHART_LABEL_TOO_SMALL',
  'XYCHART_CONFIG_INVALID',
]);

interface Case {
  readonly id: string;
  readonly theme: (typeof THEMES)[number];
  readonly source: string;
  readonly r: RenderedXyChart;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await xyChartCorpus()), ...xyChartCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedXyChart;
      try {
        r = await renderXyChartForTest(item.source, { config: { theme }, idPrefix: PREFIX });
      } catch (e) {
        if (!(e as Error).message.startsWith(XYCHART_PARSE_ERROR)) throw e;
        rejected.add(item.id);
        continue;
      }
      cases.push({
        id: `${item.id} ${theme}`,
        theme,
        source: item.source,
        r,
        tree: parseSvg(r.svg),
      });
    }
}, 300_000);

/** Every point a rect or path draws at, and every text anchor (`translate(x, y)`). */
function points(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = (el: Parameters<SvgView['getAttr']>[0], k: string): number =>
    Number(tree.getAttr(el, k) ?? 0);
  for (const el of tree.find({ tag: 'rect' })) {
    out.push({ x: n(el, 'x'), y: n(el, 'y') });
    out.push({ x: n(el, 'x') + n(el, 'width'), y: n(el, 'y') + n(el, 'height') });
  }
  for (const el of tree.find({ tag: 'path' })) {
    const nums = (tree.getAttr(el, 'd') ?? '').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2)
      out.push({ x: Number(nums[i]), y: Number(nums[i + 1]) });
  }
  for (const el of tree.find({ tag: 'text' })) {
    const m = /^translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(tree.getAttr(el, 'transform') ?? '');
    if (m) out.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return out;
}

describe('xychart render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with bars, lines, legends and data labels', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(60);
    // Every e2e fixture renders; the cases file holds the rejections.
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(rejected.size).toBeLessThan(corpus.length / 2);
    expect(cases.length).toBe((corpus.length - rejected.size) * THEMES.length);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="bar-plot-0"',
      'class="line-plot-0"',
      'class="legend"',
      'class="labels"',
      'class="top-axis"',
    ])
      expect(all, part).toContain(part);
    expect(
      cases.some((c) => c.r.layout.plots.some((p) => p.kind === 'bar' && p.dataLabels.length > 0))
    ).toBe(true);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined or foreignObject', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|mermaid-tmp-group/);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect(
        (await renderXyChartForTest(c.source, { config: { theme: c.theme }, idPrefix: PREFIX }))
          .svg,
        c.id
      ).toBe(c.r.svg);
  });

  it('writes no element id but the title and the description (D133)', () => {
    for (const c of cases)
      expect(
        c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined).map((n) => c.tree.getAttr(n, 'id')),
        c.id
      ).toEqual([
        ...(c.r.model.accTitle.trim() ? [`${PREFIX}-title`] : []),
        ...(c.r.model.accDescr.trim() ? [`${PREFIX}-desc`] : []),
      ]);
  });

  it('keeps everything drawn inside the viewBox, which is the layout bounds (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const b = c.r.layout.bounds;
      expect([x, y], c.id).toEqual([
        Math.round(b.x * 100) / 100 + 0,
        Math.round(b.y * 100) / 100 + 0,
      ]);
      expect(w! >= b.width - TOL && h! >= b.height - TOL, c.id).toBe(true);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(points(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
    }
  });

  it('declares every alias it refers to on the root', () => {
    for (const c of cases) {
      const declared = new Set([...c.r.svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]));
      const used = [...c.r.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]);
      expect(
        used.filter((a) => !declared.has(a)),
        c.id
      ).toEqual([]);
    }
  });

  it("warns only the XY chart's own codes, once each (D383)", () => {
    for (const c of cases) {
      const codes = c.r.warnings.map((w) => w.code).filter((code) => code.startsWith('XYCHART_'));
      expect(
        codes.filter((code) => !WARNINGS.has(code)),
        c.id
      ).toEqual([]);
      expect(new Set(codes).size, c.id).toBe(codes.length);
    }
  });
});

describe('xychart through the public API (#513)', () => {
  const version = (svg: string) => svg.replace(/ data-mermaid-version="[^"]*"/, '');

  it('renders each case byte for byte as the plugin seam does, and rejects the same sources', async () => {
    const apis = new Map(THEMES.map((theme) => [theme, xyChartApi({ theme })]));
    // The seam leaves a directive core's preprocessing reports to the parser; the API rejects
    // an unclosed one before it parses (UNCLOSED_DIRECTIVE, the T2 choice, `divergences/`).
    const unclosed: string[] = [];
    let rendered = 0;
    for (const c of cases.filter((_, i) => i % 2 === 0)) {
      let svg: string;
      try {
        ({ svg } = await apis.get(c.theme)!.render(PREFIX, c.source));
      } catch (e) {
        if (!(e instanceof MermaidError)) throw e;
        // The seam parses a source v12's detector does not take (`XYCHART`); the API does not.
        if (e.code === 'UNSUPPORTED_DIAGRAM' && !detectXyChart(c.source)) continue;
        if (!e.message.includes('directive is never closed')) throw e;
        unclosed.push(c.id);
        continue;
      }
      rendered++;
      expect(version(svg), c.id).toBe(version(c.r.svg));
    }
    expect(rendered).toBeGreaterThan(unclosed.length * 10);
    const api = apis.get('default')!;
    for (const item of corpus.filter((i) => rejected.has(i.id)))
      await expect(api.render(PREFIX, item.source), item.id).rejects.toBeInstanceOf(MermaidError);
  }, 300_000);
});

describe('xychart AST round-trip over the parsed corpus (R-PARSE-8)', () => {
  const GROUP_OF: Readonly<Record<string, RegExp>> = {
    Plot: /^(?:bar|line)-plot-\d+$/,
    Axis: /^(?:bottom|left|top)-axis$/,
    Title: /^chart-title$/,
  };

  it('maps each drawn Plot, Axis and Title to exactly one group, and nothing else has data-ast', () => {
    for (const c of cases) {
      const ast = c.r.ast!;
      const index = astIndex(ast as AstNode);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: data-ast ${id}`).toBeDefined();
        expect(c.tree.tag(el), `${c.id}: ${id}`).toBe('g');
        expect(c.tree.getAttr(el, 'class'), `${c.id}: ${id}`).toMatch(GROUP_OF[node!.type]!);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBeUndefined();
        const { start, end } = node!.range;
        expect(start >= 0 && end > start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
      }
      const { model, layout } = c.r;
      // Every plot has its group; the shown axes and the in-text title have theirs.
      for (const p of model.plots) expect(seen.get(p.ast), `${c.id}: ${p.ast}`).toBe(1);
      const axisDrawn = (a: typeof layout.xAxis) =>
        a.line !== undefined ||
        a.title !== undefined ||
        a.ticks.some((t) => t.line !== undefined || t.label !== undefined);
      for (const [a, id] of [
        [layout.xAxis, model.xAxis.ast],
        [layout.yAxis, model.yAxis.ast],
      ] as const)
        if (id !== undefined)
          expect(seen.get(id) ?? 0, `${c.id}: ${id}`).toBe(axisDrawn(a) ? 1 : 0);
      if (model.titleAst !== undefined)
        expect(seen.get(model.titleAst) ?? 0, c.id).toBe(layout.title ? 1 : 0);
      for (const [id, n] of seen) expect(n, `${c.id}: ${id}`).toBe(1);
    }
  });

  it('gives every data-id a plot id, on bars, lines, labels and legend rows', () => {
    for (const c of cases) {
      const plots = new Set(c.r.model.plots.map((p) => p.ast));
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-id') !== undefined)) {
        expect(plots.has(c.tree.getAttr(el, 'data-id')!), c.id).toBe(true);
        expect(['rect', 'path', 'text'], c.id).toContain(c.tree.tag(el));
      }
    }
  });
});
