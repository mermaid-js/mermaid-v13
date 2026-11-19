import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutXyChart,
  parseXyChart,
  type Segment,
  type XyChartLayout,
  type XyChartModel,
  type XyText,
} from '@mermaid-js/diagram-xychart';
import {
  configNumber,
  xyChartLayoutViolations,
  xyChartTestContext,
  xyChartTestTheme,
} from '@mermaid-js/diagram-xychart/testing';
import { REPO_ROOT, corpusFromDir } from '../corpus.ts';
import { v12DecodeEntities } from '../v12-entities.ts';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { spacedWords, xyChartCases, xyChartCorpus, xyChartOrderCorpus } from './corpus.ts';
import { v12DataLabels, type V12Rect } from './v12-data-labels.ts';

/**
 * Layout parity (spec #426 T3): `layoutXyChart` equals v12 to 0.01 px on every drawn part: what
 * v12's chart builder gives (`XYChartBuilder.build`, through the DB's `getDrawableElem()`: axis
 * lines, ticks and their stroke widths, tick labels, axis titles, bars, line paths as strings,
 * point labels, legend markers and labels, the title), and the data labels v12's renderer adds
 * (`v12-data-labels.ts`, its block ported verbatim): text, place, anchor, baseline, font size.
 * v12's builder runs headless in the oracle (no SVG group: text is `length × fontSize` wide and
 * `fontSize` high, `textDimensionCalculator.ts:12-17`), so v13 lays out with that measurer. The
 * models are the v13 parser's, so the layout invariants also run on parser-produced fixtures.
 *
 * v12's output is compared as it is. Where v13 differs by decision, the source is listed with
 * its reason, and each list must stay what the test says:
 * - `bar held in the plot box` (T3 invariant, a maintainer choice): v12 drew a bar past an end of
 *   the range with a negative size, or out of the plot box; v13 holds it inside. Its data labels
 *   then differ too.
 * - `D383 label too small`: v12 wrote labels at a size of 0 or less; v13 draws none.
 * - `D383 missing value`, `D385 line break`: the source is not compared (v12 wrote NaN; v12
 *   printed `<br>` and line breaks in one line).
 * - `#683 spaced words`: the source is not compared (v12 joined the words of unquoted text,
 *   v13 keeps one space between them, `spacedWords`).
 * - `v12: a negative titlePadding …`: a value outside the schema, taken as v12 takes it; v12
 *   itself then draws the title over the plot, which the invariant reports.
 * Data labels use each bar plot's own values (D382; v12 used plot 0's), and legend swatches get
 * none (a maintainer choice; v12 labelled every `rect`).
 */

/** v12's headless text measure: `length × fontSize` by `fontSize`. */
const v12Measurer: Measurer = {
  id: 'v12-headless',
  width: (text, font) => text.length * font.size,
  metrics: (font) => ({ ascent: font.size, descent: 0, lineHeight: font.size }),
};

interface V12Text {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
  verticalPos: 'top' | 'middle';
  horizontalPos: 'left' | 'center' | 'right';
}
interface V12Path {
  path: string;
  strokeWidth: number;
}
type V12Elem =
  | { groupTexts: string[]; type: 'text'; data: V12Text[] }
  | { groupTexts: string[]; type: 'rect'; data: V12Rect[] }
  | { groupTexts: string[]; type: 'path'; data: V12Path[] };

interface XyChartDb {
  getDrawableElem(): V12Elem[];
  getDiagramTitle(): string;
  setDiagramTitle(title: string): void;
  getXYChartData(): { plots: { data: [string, number | undefined][] }[] };
  getChartConfig(): {
    chartOrientation: string;
    showDataLabel: boolean;
    showDataLabelOutsideBar: boolean;
  };
}

/** What v12 drew for a source: the builder's drawables, the data labels, and the plots' values. */
interface V12Drawn {
  elems: V12Elem[];
  /** Per bar plot index, its data labels (when `showDataLabel`). */
  dataLabels: Map<number, ReturnType<typeof v12DataLabels>>;
}

/**
 * Why v13 draws `m` other than v12 by decision, so that it is not compared at all: a band value
 * missing (D383: v12 wrote NaN), or a line break in a text core label layout breaks (D385: v12
 * printed it in one line).
 */
function notCompared(m: XyChartModel): string | undefined {
  if (m.plots.some((p) => p.data.some((d) => d.y === undefined))) return 'D383 missing value';
  const texts = [
    m.title ?? '',
    m.xAxis.title,
    m.yAxis.title,
    ...(m.xAxis.kind === 'band' ? m.xAxis.categories : []),
    ...m.plots.flatMap((p) => [p.name, ...(p.pointLabels ?? [])]),
  ];
  if (texts.some((t) => /\n|<br/i.test(t))) return 'D385 line break';
  return undefined;
}

/** The source's `xyChart` options: front matter, then each `%%{init}` directive. */
function section(source: string): Record<string, unknown> {
  const pre = preprocess(source);
  let out: Record<string, unknown> = {};
  const merge = (s: unknown): void => {
    if (!s || typeof s !== 'object') return;
    const add = s as Record<string, unknown>;
    const next: Record<string, unknown> = { ...out, ...add };
    for (const k of ['xAxis', 'yAxis'])
      if (add[k] && typeof add[k] === 'object')
        next[k] = { ...(out[k] as object | undefined), ...add[k] };
    out = next;
  };
  merge((pre.frontMatter?.config as { xyChart?: unknown } | undefined)?.xyChart);
  for (const d of pre.directives)
    if (d.kind === 'init') merge((d.args as { xyChart?: unknown } | undefined)?.xyChart);
  return out;
}

/**
 * `options` with numeric strings read as the package reads them (`configNumber`): v12 measured
 * text in the DOM, where a font size of `"20"` is 20 px; its headless measure would add the
 * string (`"20" + 10` is `"2010"`).
 */
function numeric(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options)) {
    if (typeof v === 'string') out[k] = configNumber(v) ?? v;
    else if (v && typeof v === 'object') out[k] = numeric(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

/**
 * What v12 drew for `source`, or undefined when it rejects it. The oracle's `getDiagramFromText`
 * skips front matter, where v12's render set its title before the parse; so a front-matter
 * title is set when the text has none.
 */
async function v12Drawn(
  source: string,
  xyChart: Record<string, unknown>
): Promise<V12Drawn | undefined> {
  const oracle = await loadOracle();
  const result = await oracle.parse(source, { xyChart: numeric(xyChart) });
  if (!result.accepted) return undefined;
  const db = result.db as XyChartDb;
  const front = preprocess(source).frontMatter?.title;
  if (front !== undefined && db.getDiagramTitle() === '') db.setDiagramTitle(front);
  const elems = structuredClone(db.getDrawableElem());
  const config = db.getChartConfig();
  const plots = db.getXYChartData().plots;
  const dataLabels = new Map<number, ReturnType<typeof v12DataLabels>>();
  // v12 threw on a missing value here (`.toString()` of undefined); such a source is not compared.
  const complete = plots.every((p) => p.data.every((d) => d[1] !== undefined));
  if (config.showDataLabel && complete)
    for (const e of elems) {
      const bar = e.type === 'rect' ? /^bar-plot-(\d+)$/.exec(e.groupTexts[1] ?? '') : null;
      if (!bar || e.type !== 'rect' || e.groupTexts[0] !== 'plot') continue;
      const index = Number(bar[1]);
      const own = plots[index]!.data.map((d) => d[1]);
      dataLabels.set(index, v12DataLabels(e.data, own, config));
    }
  return { elems, dataLabels };
}

/** The v13 parser's model of `source`, or undefined when it rejects it. */
function model(source: string): XyChartModel | undefined {
  const result = parseXyChart(source);
  return result.diagnostics.some((d) => d.severity === 'error') ? undefined : result.model;
}

/** A path as its commands: each letter with its numbers. */
const commands = (path: string): (string | number)[][] =>
  [...path.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map((m) => [
    m[1]!,
    ...(m[2]!.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number),
  ]);

const segment = (s: Segment): (string | number)[][] => [
  ['M', s.x1, s.y1],
  ['L', s.x2, s.y2],
];

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;
const BASELINE = { top: 'top', middle: 'middle', hanging: 'hanging', auto: 'alphabetic' } as const;

// v12's renderer decoded its `encodeEntities` placeholders before drawing; v13 keeps the text
// as written and core label layout decodes it.
const v12Text = (t: V12Text) => ({
  text: v12DecodeEntities(t.text),
  x: t.x,
  y: t.y,
  size: t.fontSize,
  rotation: t.rotation,
  anchor: ANCHOR[t.horizontalPos],
  baseline: BASELINE[t.verticalPos],
});
const v13Text = (t: XyText) => ({
  text: t.text,
  x: t.x,
  y: t.y,
  size: t.font.size,
  rotation: t.rotation,
  anchor: t.anchor,
  baseline: t.baseline,
});

type Flat = Record<string, number | string>;

/** v12's drawing in a shape both sides map to, keyed by v12's group path. */
function v12Shape(drawn: V12Drawn): Flat {
  const out: Record<string, unknown[]> = {};
  const push = (key: string, v: unknown): void => {
    (out[key] ??= []).push(v);
  };
  for (const e of drawn.elems) {
    const key = e.groupTexts.join('/');
    for (const d of e.data) {
      if (e.type === 'text') push(key, v12Text(d as V12Text));
      else if (e.type === 'rect') {
        const r = d as V12Rect;
        push(key, { x: r.x, y: r.y, width: r.width, height: r.height });
      } else {
        const p = d as V12Path;
        const isLine = key.startsWith('plot/line-plot-');
        push(key, {
          d: commands(p.path),
          strokeWidth: p.strokeWidth,
          ...(isLine ? { path: p.path } : {}),
        });
      }
    }
  }
  for (const [index, labels] of drawn.dataLabels)
    for (const l of labels)
      push(`plot/bar-plot-${index}/data-labels`, {
        text: l.text,
        x: l.x,
        y: l.y,
        size: l.fontSize,
        anchor: l.anchor,
        baseline: BASELINE[l.baseline],
      });
  return flatten(out);
}

/** The v13 layout in v12's group paths and order (`getDrawableElement`, `orchestrator.ts:213`). */
function v13Shape(l: XyChartLayout): Flat {
  const out: Record<string, unknown[]> = {};
  const push = (key: string, v: unknown): void => {
    (out[key] ??= []).push(v);
  };
  if (l.title) push('chart-title', v13Text(l.title));
  for (const p of l.plots) {
    if (p.kind === 'bar') {
      for (const b of p.bars)
        push(`plot/bar-plot-${p.index}`, { x: b.x, y: b.y, width: b.width, height: b.height });
      for (const t of p.dataLabels) {
        const { rotation: _, ...rest } = v13Text(t);
        push(`plot/bar-plot-${p.index}/data-labels`, rest);
      }
    } else {
      if (p.path)
        push(`plot/line-plot-${p.index}`, {
          d: commands(p.path),
          strokeWidth: p.strokeWidth,
          path: p.path,
        });
      for (const t of p.pointLabels) push(`plot/line-plot-${p.index}/labels`, v13Text(t));
    }
  }
  if (l.legend) {
    for (const r of l.legend.rows)
      if (r.swatch)
        push('legend/markers', {
          x: r.swatch.x,
          y: r.swatch.y,
          width: r.swatch.width,
          height: r.swatch.height,
        });
    for (const r of l.legend.rows)
      if (r.stroke)
        push('legend/markers', { d: segment(r.stroke), strokeWidth: r.strokeWidth ?? 0 });
    for (const r of l.legend.rows) push('legend/label', v13Text(r.label));
  }
  for (const axis of [l.xAxis, l.yAxis]) {
    const pos = `${axis.position}-axis`;
    if (axis.line)
      push(`${pos}/${axis.position === 'left' ? 'axisl-line' : 'axis-line'}`, {
        d: segment(axis.line),
        strokeWidth: axis.lineWidth,
      });
    for (const t of axis.ticks) if (t.label) push(`${pos}/label`, v13Text(t.label));
    for (const t of axis.ticks)
      if (t.line) push(`${pos}/ticks`, { d: segment(t.line), strokeWidth: axis.tickWidth });
    if (axis.title) push(`${pos}/title`, v13Text(axis.title));
  }
  return flatten(out);
}

function flatten(value: unknown, path = '', out: Flat = {}): Flat {
  if (value === null || typeof value !== 'object') out[path] = value as number | string;
  else if (Array.isArray(value)) {
    out[`${path}.length`] = value.length;
    value.forEach((v, i) => flatten(v, `${path}[${i}]`, out));
  } else for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out);
  return out;
}

/** Every leaf where `a` and `b` differ, numbers by more than 0.01. */
function differences(a: Flat, b: Flat): string[] {
  const out: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    const same = typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 0.01 : x === y;
    if (!same) out.push(`${key}: v13 ${String(x)}, v12 ${String(y)}`);
  }
  return out;
}

/** The bar plots v12 drew a bar of past the plot box or with a negative size. */
function heldPlots(drawn: V12Drawn, plot: XyChartLayout['plot']): Set<number> {
  const out = new Set<number>();
  const e = 0.01;
  for (const el of drawn.elems) {
    const m = el.type === 'rect' ? /^bar-plot-(\d+)$/.exec(el.groupTexts[1] ?? '') : null;
    if (!m || el.type !== 'rect') continue;
    const outside = el.data.some(
      (r) =>
        r.width < 0 ||
        r.height < 0 ||
        r.x < plot.x - e ||
        r.y < plot.y - e ||
        r.x + r.width > plot.x + plot.width + e ||
        r.y + r.height > plot.y + plot.height + e
    );
    if (outside) out.add(Number(m[1]));
  }
  return out;
}

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await xyChartTestTheme();
  corpus = [];
  const dir = 'e2e/diagrams/xychart';
  for await (const item of corpusFromDir(join(REPO_ROOT, dir), dir)) corpus.push(item);
});

interface Comparison {
  problems: string[];
  /** Reason → the ids that differ for it, by decision. */
  listed: Map<string, string[]>;
  compared: number;
}

/** Each item's differences from v12 and its invariant violations, with `extra` over its config. */
async function compare(
  items: readonly CorpusItem[],
  extra: Record<string, unknown>
): Promise<Comparison> {
  const problems: string[] = [];
  const listed = new Map<string, string[]>();
  const list = (reason: string, id: string): void => {
    const ids = listed.get(reason) ?? [];
    if (!ids.includes(id)) ids.push(id);
    listed.set(reason, ids);
  };
  let compared = 0;
  for (const item of items) {
    const own = section(item.source);
    const xyChart = {
      ...own,
      ...extra,
      xAxis: { ...(own.xAxis as object | undefined), ...(extra.xAxis as object | undefined) },
      yAxis: { ...(own.yAxis as object | undefined), ...(extra.yAxis as object | undefined) },
    };
    const m = model(item.source);
    const drawn = await v12Drawn(item.source, xyChart);
    // Acceptance is the parser gates' (listed divergences, detection); compare what both draw.
    if (!m || !drawn) continue;
    const skip = spacedWords(item.source) ? '#683 spaced words' : notCompared(m);
    if (skip) {
      list(skip, item.id);
      continue;
    }
    compared++;
    const layout = layoutXyChart(m, xyChartTestContext(theme, xyChart, { measurer: v12Measurer }));
    const tag = `${item.id} ${JSON.stringify(extra)}`;
    const held = heldPlots(drawn, layout.plot);
    const tiny = [...drawn.dataLabels].filter(([, ls]) => ls.some((l) => !(l.fontSize > 0)));
    for (const d of differences(v13Shape(layout), v12Shape(drawn))) {
      const bar = /^plot\/bar-plot-(\d+)/.exec(d);
      if (bar && held.has(Number(bar[1]))) list('bar held in the plot box', item.id);
      else if (bar && d.includes('/data-labels') && tiny.some(([i]) => i === Number(bar[1])))
        list('D383 label too small', item.id);
      else problems.push(`${tag}: ${d}`);
    }
    // v12 itself puts the title over the plot when `titlePadding` is negative.
    const overlap = configNumber((xyChart as Record<string, unknown>).titlePadding) ?? 0;
    for (const v of xyChartLayoutViolations(m, layout)) {
      if (v === 'the title is not above the plot' && overlap < 0)
        list('v12: a negative titlePadding overlaps the title and the plot', item.id);
      else problems.push(`${tag}: ${v}`);
    }
  }
  return { problems, listed, compared };
}

/** Config variants over every fixture: orientation, rotation, space, sizes, hidden parts. */
const VARIANTS: readonly Record<string, unknown>[] = [
  { chartOrientation: 'horizontal' },
  { xAxis: { labelRotation: 45 }, yAxis: { labelRotation: -30 } },
  { xAxis: { labelRotation: -90 }, chartOrientation: 'horizontal' },
  { plotReservedSpacePercent: 85, showLegend: false },
  { width: 260, height: 180, legendFontSize: 30 },
  { width: 1500, height: 90, titleFontSize: 40, titlePadding: 30 },
  { xAxis: { showAxisLine: false, tickLength: 12 }, yAxis: { showTick: false, labelPadding: 0 } },
  { showDataLabel: true },
  { showDataLabel: true, showDataLabelOutsideBar: true, chartOrientation: 'horizontal' },
  { showDataLabel: true, showDataLabelOutsideBar: true, width: 300 },
  // Outside the schema's ranges, as v12 takes them (story 6, D383).
  { plotReservedSpacePercent: 20, legendPadding: -4 },
  { titlePadding: -5, xAxis: { labelPadding: -3, titlePadding: -2 }, yAxis: { tickLength: -4 } },
  { xAxis: { labelFontSize: 400 }, yAxis: { titleFontSize: 300 }, titleFontSize: 250 },
];

describe('xychart layout parity with v12', () => {
  it('equals v12 on the e2e corpus, to 0.01 px', async () => {
    expect(corpus.length).toBe(63);
    const { problems, listed, compared } = await compare(corpus, {});
    expect(problems.slice(0, 30)).toEqual([]);
    // The text baseline's `<br>` labels (D385) and #683's fixture are not compared. v12 wrote the
    // automatic-range fixture's data labels at a size under 1; v13 draws those that fit (D611).
    expect([...listed]).toEqual([
      ['D385 line break', ['e2e/diagrams/xychart/baseline/text/labels.mmd']],
      [
        'D383 label too small',
        ['e2e/diagrams/xychart/nightly-check/data-labels-auto-range-vertical.mmd'],
      ],
      ['#683 spaced words', ['e2e/diagrams/xychart/pr-check/unquoted-text-keeps-spaces.mmd']],
    ]);
    expect(compared).toBe(61);
  });

  it.each(VARIANTS)('equals v12 on the e2e corpus under %o', async (extra) => {
    const { problems, listed } = await compare(corpus, extra);
    expect(problems.slice(0, 30)).toEqual([]);
    const allowed = [
      'D385 line break',
      '#683 spaced words',
      'D383 label too small',
      'v12: a negative titlePadding overlaps the title and the plot',
    ];
    expect([...listed.keys()].filter((r) => !allowed.includes(r))).toEqual([]);
  });

  it('equals v12 on every corpus source and statement order both accept, but the listed ones', async () => {
    const all = [...(await xyChartCorpus()), ...xyChartCases(), ...(await xyChartOrderCorpus())];
    const { problems, listed, compared } = await compare(all, { showDataLabel: true });
    expect(compared).toBeGreaterThan(1200);
    expect(problems.slice(0, 30)).toEqual([]);
    expect([...listed.keys()].sort()).toEqual([
      '#683 spaced words',
      'D383 label too small',
      'D383 missing value',
      'D385 line break',
      'bar held in the plot box',
    ]);
    // The held bars, by source: values under a `y-axis` minimum read after the plot
    // (`data-labels-within-bars-*` reordered, `number-negative-arrow`), and plots written before
    // their linear `x-axis` (D386), past its range (`correct-distances-…` reordered).
    const held = listed.get('bar held in the plot box')!;
    const sources = new Set(
      held.map((id) => id.replace(/^xychart-order\//, '').replace(/ \([\d ]+\)$/, ''))
    );
    expect([...sources].sort()).toEqual([
      'e2e/nightly-check/correct-distances-between-data-points.mmd',
      'e2e/nightly-check/data-labels-within-bars-horizontal.mmd',
      'e2e/nightly-check/data-labels-within-bars-vertical.mmd',
      'xychart-cases/number-negative-arrow',
    ]);
    expect(held.length).toBe(29);
  }, 180_000);
});
