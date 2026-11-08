import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { preprocess } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutXyChart,
  parseXyChart,
  type XyChartLayout,
  type XyChartModel,
  type XyText,
} from '@mermaid-js/diagram-xychart';
import {
  xyChartLayoutViolations,
  xyChartTestContext,
  xyChartTestTheme,
} from '@mermaid-js/diagram-xychart/testing';
import { REPO_ROOT, corpusFromDir } from '../corpus.ts';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadOracle } from '../oracle.ts';
import type { CorpusItem } from '../types.ts';
import { xyChartCases, xyChartCorpus, xyChartOrderCorpus } from './corpus.ts';

/**
 * Builder parity (spec #426 T3): `layoutXyChart` equals v12's chart builder
 * (`XYChartBuilder.build`, through the DB's `getDrawableElem()`) to 0.01 px on every drawn part
 * (axis lines, ticks, tick labels, axis titles, bars, line paths, point labels, legend markers
 * and labels, the title) over the e2e fixtures, with their `xyChart` config. v12's builder runs
 * headless in the oracle (no SVG group: text is `length × fontSize` wide and `fontSize` high,
 * `textDimensionCalculator.ts:12-17`), so v13 lays out with that measurer. The models are the
 * v13 parser's, so the layout invariants also run on parser-produced fixtures.
 *
 * One listed difference: v13 holds a bar inside the plot box (D383, the invariant), where v12
 * drew a value under the axis minimum with a negative height or one over the maximum past the
 * plot. v12's bars are held the same way before comparing (the e2e corpus has no such bar; the
 * package's `layout.spec.ts` covers it). Every fixture is also compared under config variants.
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
interface V12Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface V12Path {
  path: string;
}
type V12Elem =
  | { groupTexts: string[]; type: 'text'; data: V12Text[] }
  | { groupTexts: string[]; type: 'rect'; data: V12Rect[] }
  | { groupTexts: string[]; type: 'path'; data: V12Path[] };

interface XyChartDb {
  getDrawableElem(): V12Elem[];
  getDiagramTitle(): string;
  setDiagramTitle(title: string): void;
}

/**
 * Why v13 draws `m` other than v12 by decision, if it does: a band value missing (D383: v12
 * wrote NaN), or a line break in a text core label layout breaks (D385: v12 printed it in one
 * line).
 */
function listedDifference(m: XyChartModel): string | undefined {
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
 * `section` with numeric strings as numbers: v12 measured text in the DOM, where a font size of
 * `"20"` is 20 px; its headless measure would add the string (`"20" + 10` is `"2010"`).
 */
function numeric(options: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(options)) {
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) out[k] = Number(v);
    else if (v && typeof v === 'object') out[k] = numeric(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

/**
 * v12's drawables for `source`. The oracle's `getDiagramFromText` skips front matter, where v12's
 * render set its title before the parse; so a front-matter title is set when the text has none.
 */
async function v12Elems(
  source: string,
  xyChart: Record<string, unknown>
): Promise<V12Elem[] | undefined> {
  const oracle = await loadOracle();
  const result = await oracle.parse(source, { xyChart: numeric(xyChart) });
  if (!result.accepted) return undefined;
  const db = result.db as XyChartDb;
  const front = preprocess(source).frontMatter?.title;
  if (front !== undefined && db.getDiagramTitle() === '') db.setDiagramTitle(front);
  return structuredClone(db.getDrawableElem());
}

/** The v13 parser's model of `source`, or undefined when it rejects it. */
function model(source: string): XyChartModel | undefined {
  const result = parseXyChart(source);
  return result.diagnostics.some((d) => d.severity === 'error') ? undefined : result.model;
}

/** Every number in a path, in order. */
const numbers = (path: string): number[] =>
  (path.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []).map(Number);

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

// v12's renderer decoded its `encodeEntities` placeholders before drawing; v13 keeps the text
// as written and core label layout decodes it.
const v12Text = (t: V12Text) => ({
  text: decodeEntities(t.text),
  x: t.x,
  y: t.y,
  size: t.fontSize,
  rotation: t.rotation,
  anchor: ANCHOR[t.horizontalPos],
  baseline: t.verticalPos,
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

/** v12's drawables in a shape both sides map to, keyed by v12's group path. */
function v12Shape(elems: V12Elem[], plot: XyChartLayout['plot'], horizontal: boolean): Flat {
  const out: Record<string, unknown[]> = {};
  const push = (key: string, v: unknown): void => {
    (out[key] ??= []).push(v);
  };
  for (const e of elems) {
    const key = e.groupTexts.join('/');
    for (const d of e.data) {
      if (e.type === 'text') push(key, v12Text(d as V12Text));
      else if (e.type === 'path') push(key, numbers((d as V12Path).path));
      else push(key, held(d as V12Rect, plot, horizontal, key.startsWith('plot/')));
    }
  }
  return flatten(out);
}

/** A v12 bar held inside the plot box as v13 holds it (the listed difference). */
function held(
  r: V12Rect,
  plot: XyChartLayout['plot'],
  horizontal: boolean,
  isBar: boolean
): V12Rect {
  if (!isBar) return { x: r.x, y: r.y, width: r.width, height: r.height };
  const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
  const [x0, x1] = [plot.x, plot.x + plot.width];
  const [y0, y1] = [plot.y, plot.y + plot.height];
  // v12's value end (the top of a vertical bar, the right of a horizontal one) can pass the
  // axis, which makes the size negative; its other end is the axis.
  if (horizontal) {
    const y = clamp(r.y, y0, y1);
    return {
      x: r.x,
      y,
      width: clamp(r.x + r.width, x0, x1) - r.x,
      height: clamp(r.y + r.height, y0, y1) - y,
    };
  }
  const x = clamp(r.x, x0, x1);
  const top = clamp(r.y, y0, y1);
  return { x, y: top, width: clamp(r.x + r.width, x0, x1) - x, height: r.y + r.height - top };
}

/** The v13 layout in v12's group paths and order (`getDrawableElement`, `orchestrator.ts:213`). */
function v13Shape(l: XyChartLayout): Flat {
  const out: Record<string, unknown[]> = {};
  const push = (key: string, v: unknown): void => {
    (out[key] ??= []).push(v);
  };
  const seg = (s: { x1: number; y1: number; x2: number; y2: number }) => [s.x1, s.y1, s.x2, s.y2];
  if (l.title) push('chart-title', v13Text(l.title));
  for (const p of l.plots) {
    if (p.kind === 'bar') {
      for (const b of p.bars)
        push(`plot/bar-plot-${p.index}`, { x: b.x, y: b.y, width: b.width, height: b.height });
    } else {
      if (p.path) push(`plot/line-plot-${p.index}`, numbers(p.path));
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
    for (const r of l.legend.rows) if (r.stroke) push('legend/markers', seg(r.stroke));
    for (const r of l.legend.rows) push('legend/label', v13Text(r.label));
  }
  for (const axis of [l.xAxis, l.yAxis]) {
    const pos = `${axis.position}-axis`;
    if (axis.line)
      push(`${pos}/${axis.position === 'left' ? 'axisl-line' : 'axis-line'}`, seg(axis.line));
    for (const t of axis.ticks) if (t.label) push(`${pos}/label`, v13Text(t.label));
    for (const t of axis.ticks) if (t.line) push(`${pos}/ticks`, seg(t.line));
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

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await xyChartTestTheme();
  corpus = [];
  const dir = 'e2e/diagrams/xychart';
  for await (const item of corpusFromDir(join(REPO_ROOT, dir), dir)) corpus.push(item);
});

/** Each item's differences from v12 and its invariant violations, with `extra` over its config. */
async function compare(
  items: readonly CorpusItem[],
  extra: Record<string, unknown>
): Promise<string[]> {
  const problems: string[] = [];
  for (const item of items) {
    const own = section(item.source);
    const xyChart = {
      ...own,
      ...extra,
      xAxis: { ...(own.xAxis as object | undefined), ...(extra.xAxis as object | undefined) },
      yAxis: { ...(own.yAxis as object | undefined), ...(extra.yAxis as object | undefined) },
    };
    const m = model(item.source);
    if (!m) {
      problems.push(`${item.id}: v13 rejected it`);
      continue;
    }
    const layout = layoutXyChart(m, xyChartTestContext(theme, xyChart, { measurer: v12Measurer }));
    const elems = await v12Elems(item.source, xyChart);
    if (!elems) {
      problems.push(`${item.id}: v12 rejected it`);
      continue;
    }
    const horizontal = layout.orientation === 'horizontal';
    const tag = `${item.id} ${JSON.stringify(extra)}`;
    for (const d of differences(v13Shape(layout), v12Shape(elems, layout.plot, horizontal)))
      problems.push(`${tag}: ${d}`);
    for (const v of xyChartLayoutViolations(m, layout)) problems.push(`${tag}: ${v}`);
  }
  return problems;
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
];

describe('xychart layout parity with v12 getDrawableElem()', () => {
  it('equals v12 on the e2e corpus, to 0.01 px', async () => {
    expect(corpus.length).toBe(48);
    expect((await compare(corpus, {})).slice(0, 30)).toEqual([]);
  });

  it.each(VARIANTS)('equals v12 on the e2e corpus under %o', async (extra) => {
    expect((await compare(corpus, extra)).slice(0, 30)).toEqual([]);
  });

  it('equals v12 on every corpus source and statement order both accept, but the listed ones', async () => {
    const all = [...(await xyChartCorpus()), ...xyChartCases(), ...(await xyChartOrderCorpus())];
    const compared: CorpusItem[] = [];
    const listed = new Map<string, number>();
    for (const item of all) {
      const m = model(item.source);
      const reason = m && listedDifference(m);
      if (reason) listed.set(reason, (listed.get(reason) ?? 0) + 1);
      else if (m && (await v12Elems(item.source, section(item.source)))) compared.push(item);
    }
    expect(compared.length).toBeGreaterThan(1200);
    expect([...listed.keys()].sort()).toEqual(['D383 missing value', 'D385 line break']);
    expect((await compare(compared, {})).slice(0, 30)).toEqual([]);
  }, 120_000);
});
