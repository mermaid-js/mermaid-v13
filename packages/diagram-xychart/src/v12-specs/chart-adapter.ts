// cspell:words drawables
/**
 * Test-only adapter for the ported v12 chart-builder specs (`chartTitle.spec.ts`,
 * `legend.spec.ts`, R-TEST-3): v12's `XYChartBuilder.build`, `ChartLegend`,
 * `getChartLegendComponent`, `defaultConfig` and `themes`, backed by the v13 layout and renderer.
 * The specs' expectations are kept as v12 wrote them; this file only translates shapes:
 *
 * - v12's chart data (`XYChartData`) becomes an `XyChartModel`, its plots' `fill`/`strokeFill`
 *   the plot palette and its theme config (`XYChartThemeConfig`) `themeVariables.xyChart`, so
 *   colours reach the SVG through the theme table (D335, D545), written as literals;
 * - text is measured as v12 measured it headless (`length × fontSize` by `fontSize`), or by the
 *   spec's `TextDimensionCalculator`;
 * - v12's drawables are read back from the rendered SVG: one per run of leaves of one kind in
 *   one group (`groupTexts` = the classes of the `<g>`s under `g.main`), rects, paths (in v12's
 *   `M x,y L x,y` form) and texts (`translate(x, y) rotate(r)`, anchor, baseline).
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { AstId } from '@mermaid-js/core/parser-kit';
import { streamWriter } from '@mermaid-js/core/svg';
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { xyChartOptions } from '../config.ts';
import { layoutXyChart } from '../layout/index.ts';
import { Legend } from '../layout/layout.ts';
import { NORMAL_WEIGHT } from '../layout/metrics.ts';
import { textMeasure } from '../layout/text.ts';
import type { XyAxisLayout, XyChartLayout } from '../layout/types.ts';
import type { XyChartModel, XyChartPlot } from '../model.ts';
import { renderXyChart } from '../render/index.ts';
import { theme as table } from '../theme/table.ts';

interface V12Plot {
  type: 'bar' | 'line';
  title: string;
  fill?: string;
  strokeFill?: string;
  data: [string | number, number][];
}

interface V12Data {
  title: string;
  xAxis:
    | { type: 'band'; title: string; categories: string[] }
    | { type: 'linear'; title: string; min: number; max: number };
  yAxis: { type: 'linear'; title: string; min: number; max: number };
  plots: V12Plot[];
}

type V12Config = Record<string, unknown>;
type V12Theme = Record<string, string>;

interface TextDimensionCalculator {
  getMaxDimension(texts: string[], fontSize: number): { width: number; height: number };
}

/** v12's `getDrawableElem()` entries, as the specs read them. */
export interface Drawable {
  groupTexts: string[];
  type: 'rect' | 'path' | 'text';
  data: Record<string, unknown>[];
}

const SPEC = await loadTheme('default');
const BASE = createTheme(SPEC, { diagram: table, cssVariables: false });

/** v12's key for each `xyChart*` variable: the table's nested keys (D335). */
const V12_KEYS = Object.entries(table.vars).flatMap(([name, v]) =>
  v.nested ? [[name, v.nested] as const] : []
);

/** `themes.default.getThemeVariables().xyChart`: the table's values under `default`. */
export const themes = {
  default: {
    getThemeVariables: (): { xyChart: V12Theme } => ({
      xyChart: Object.fromEntries(V12_KEYS.map(([name, key]) => [key, BASE.value(name)])),
    }),
  },
};

/** `defaultConfig.xyChart`: v12's defaults, as `config.ts` holds them. */
export const defaultConfig = { xyChart: xyChartOptions(undefined) };

/** v12's headless text measure, or the spec's calculator. */
function measurer(calc?: TextDimensionCalculator): Measurer {
  const size = (text: string, font: FontKey) =>
    calc
      ? calc.getMaxDimension([text], font.size)
      : { width: text.length * font.size, height: font.size };
  return {
    id: 'v12-headless',
    width: (text, font) => size(text, font).width,
    metrics: (font) => {
      const h = size('', font).height;
      return { ascent: h, descent: 0, lineHeight: h };
    },
  };
}

/** The v13 model of v12's chart data. */
function modelOf(data: V12Data): XyChartModel {
  const x = data.xAxis;
  return {
    title: data.title,
    titleAst: 'title' as AstId,
    accTitle: '',
    accDescr: '',
    xAxis:
      x.type === 'band'
        ? { kind: 'band', title: x.title, categories: x.categories, ast: 'x-axis' as AstId }
        : { kind: 'linear', title: x.title, min: x.min, max: x.max, ast: 'x-axis' as AstId },
    yAxis: { kind: 'linear', ...data.yAxis, explicit: true, ast: 'y-axis' as AstId },
    plots: data.plots.map(
      (p, index): XyChartPlot => ({
        ast: `plot:${index + 1}`,
        kind: p.type,
        name: p.title,
        index,
        values: p.data.map((d) => d[1]),
        data: p.data.map((d) => ({ x: String(d[0]), y: d[1] })),
      })
    ),
    warnings: [],
  };
}

/** The render's theme: v12's theme config as `themeVariables.xyChart`, the plots' colours the palette. */
function themeOf(data: V12Data, config: V12Theme): Theme {
  const palette = String(config.plotColorPalette ?? '').split(',');
  const colours = data.plots.map((p, i) => p.fill ?? p.strokeFill ?? palette[i % palette.length]!);
  return createTheme(SPEC, {
    diagram: table,
    cssVariables: false,
    themeVariables: { xyChart: { ...config, plotColorPalette: colours } },
  });
}

/** Renders `layout` and reads v12's drawables back from the SVG. */
function drawn(
  model: XyChartModel,
  layout: XyChartLayout,
  config: V12Config,
  theme: Theme
): Drawable[] {
  const w = streamWriter();
  const ctx = {
    config: { xyChart: config } as unknown as ResolvedConfig,
    theme,
    idPrefix: 'm',
    version: '0',
  };
  renderXyChart(model, layout, ctx, w);
  return drawables(w.finish());
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};
const decode = (s: string): string =>
  s.replace(/&(#\d+|\w+);/g, (m, e: string) =>
    e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e] ?? m)
  );

const POSITION = { start: 'left', middle: 'center', end: 'right' } as const;
const BASELINE = {
  'text-before-edge': 'top',
  hanging: 'top',
  middle: 'middle',
  auto: 'bottom',
} as const;

/** One leaf's v12 drawable data. */
function datum(tag: string, a: Record<string, string>, text: string): Record<string, unknown> {
  const n = (k: string): number => Number(a[k]);
  if (tag === 'rect')
    return {
      x: n('x'),
      y: n('y'),
      width: n('width'),
      height: n('height'),
      fill: a.fill,
      strokeFill: a.stroke,
      strokeWidth: n('stroke-width'),
    };
  if (tag === 'path')
    return {
      path: a
        .d!.replace(/([ML])/g, ' $1 ')
        .trim()
        .replace(/\s+/g, ' '),
      strokeFill: a.stroke,
      strokeWidth: n('stroke-width'),
    };
  const t = /translate\(([-\d.e]+),([-\d.e]+)\) rotate\(([-\d.e]+)\)/.exec(a.transform ?? '')!;
  return {
    text: decode(text),
    x: Number(t[1]),
    y: Number(t[2]),
    fill: a.fill,
    fontSize: n('font-size'),
    rotation: Number(t[3]),
    verticalPos: BASELINE[(a['dominant-baseline'] ?? 'middle') as keyof typeof BASELINE],
    horizontalPos: POSITION[(a['text-anchor'] ?? 'middle') as keyof typeof POSITION],
  };
}

/** v12's drawables from the SVG the renderer wrote. */
function drawables(svg: string): Drawable[] {
  const out: Drawable[] = [];
  const groups: string[] = [];
  let text: { a: Record<string, string>; body: string } | undefined;
  for (const [token] of svg.matchAll(/<[^>]*>|[^<]+/g)) {
    if (!token.startsWith('<')) {
      if (text) text.body += token;
      continue;
    }
    const closing = token.startsWith('</');
    const selfClosing = token.endsWith('/>');
    const tag = /^<\/?([\w:]+)/.exec(token)![1];
    const a: Record<string, string> = {};
    for (const p of token.matchAll(/([\w:-]+)="([^"]*)"/g)) a[p[1]!] = p[2]!;
    if (tag === 'g') {
      if (closing) groups.pop();
      else if (!selfClosing) groups.push(a.class ?? '');
      continue;
    }
    if (tag === 'tspan') continue;
    if (tag === 'text') {
      if (!closing) text = { a, body: '' };
      else if (text) {
        push(out, groups, 'text', datum('text', text.a, text.body));
        text = undefined;
      }
      continue;
    }
    if ((tag === 'rect' || tag === 'path') && groups.length > 0 && a.class !== 'background')
      push(out, groups, tag, datum(tag, a, ''));
  }
  return out;
}

function push(
  out: Drawable[],
  groups: string[],
  type: Drawable['type'],
  d: Record<string, unknown>
): void {
  const groupTexts = groups.slice(1); // under `g.main`
  const last = out[out.length - 1];
  if (last && last.type === type && last.groupTexts.join('.') === groupTexts.join('.'))
    last.data.push(d);
  else out.push({ groupTexts, type, data: [d] });
}

/** v12 `XYChartBuilder`. */
export const XYChartBuilder = {
  build(config: V12Config, data: V12Data, themeConfig: V12Theme, _group?: unknown): Drawable[] {
    const model = modelOf(data);
    const theme = themeOf(data, themeConfig);
    const layout = layoutXyChart(model, {
      config: { xyChart: config } as unknown as ResolvedConfig,
      measurer: measurer(),
      theme,
    });
    return drawn(model, layout, config, theme);
  },
};

const NO_AXIS: XyAxisLayout = {
  kind: 'band',
  position: 'bottom',
  box: { x: 0, y: 0, width: 0, height: 0 },
  range: [0, 0],
  outerPadding: 0,
  ticks: [],
  tickWidth: 0,
  lineWidth: 0,
};

/** v12 `ChartLegend`: the v13 layout's legend, drawn by the v13 renderer alone. */
export class ChartLegend {
  private readonly legend: Legend;
  private readonly model: XyChartModel;
  private readonly theme: Theme;
  constructor(
    calc: TextDimensionCalculator,
    private readonly config: V12Config,
    data: V12Data,
    themeConfig: V12Theme
  ) {
    const options = xyChartOptions(config);
    this.model = modelOf(data);
    this.theme = themeOf(data, themeConfig);
    const font: FontKey = {
      family: this.theme.value('fontFamily'),
      size: options.legendFontSize,
      weight: NORMAL_WEIGHT,
    };
    this.legend = new Legend(this.model, options, font, textMeasure(measurer(calc), undefined));
  }

  calculateSpace(available: { width: number; height: number }): { width: number; height: number } {
    return this.legend.calculateSpace(available);
  }

  setBoundingBoxXY(point: { x: number; y: number }): void {
    this.legend.setOrigin(point.x, point.y);
  }

  getDrawableElements(): Drawable[] {
    const legend = this.legend.result()?.legend;
    if (!legend) return [];
    const options = xyChartOptions(this.config);
    const layout: XyChartLayout = {
      orientation: 'vertical',
      width: options.width,
      height: options.height,
      plot: { x: 0, y: 0, width: 0, height: 0 },
      xAxis: NO_AXIS,
      yAxis: { ...NO_AXIS, kind: 'linear', position: 'left' },
      plots: [],
      legend,
      bounds: { x: 0, y: 0, width: options.width, height: options.height },
    };
    return drawn(this.model, layout, this.config, this.theme);
  }
}

/** v12 `getChartLegendComponent`, with v12's headless measure. */
export function getChartLegendComponent(
  config: V12Config,
  data: V12Data,
  themeConfig: V12Theme,
  _group?: unknown
): ChartLegend {
  return new ChartLegend(
    {
      getMaxDimension: (texts, size) => ({
        width: Math.max(0, ...texts.map((t) => t.length)) * size,
        height: size,
      }),
    },
    config,
    data,
    themeConfig
  );
}
