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
 * - v12's drawables are read back from the rendered SVG (`render/read-svg.ts`): one per run of
 *   leaves of one kind in one group (`groupTexts` = the classes of the `<g>`s under `g.main`),
 *   rects, paths (in v12's `M x,y L x,y` form) and texts (`translate(x, y) rotate(r)`, anchor,
 *   baseline, through `render.ts`'s `DOMINANT_BASELINE` inverted);
 * - `ChartLegend` is the layout's own legend component (`./testing`), placed where the spec says
 *   and drawn within the chart `layoutXyChart` lays out, of which only the legend is read back.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { AstId } from '@mermaid-js/core/parser-kit';
import { streamWriter } from '@mermaid-js/core/svg';
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { xyChartOptions } from '../config.ts';
import { layoutXyChart } from '../layout/index.ts';
import { NORMAL_WEIGHT } from '../layout/metrics.ts';
import { textMeasure } from '../layout/text.ts';
import type { XyBaseline, XyChartLayout, XyTextAnchor } from '../layout/types.ts';
import type { XyChartModel, XyChartPlot } from '../model.ts';
import { renderXyChart } from '../render/index.ts';
import { DOMINANT_BASELINE } from '../render/render.ts';
import { svgTokens } from '../render/read-svg.ts';
import { XyChartLegend } from '../testing.ts';
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
function drawn(model: XyChartModel, layout: XyChartLayout, theme: Theme): Drawable[] {
  const w = streamWriter();
  renderXyChart(model, layout, { theme, idPrefix: 'm', version: '0' }, w);
  return drawables(w.finish());
}

/** v12's `horizontalPos` for each `text-anchor` (`getTextAnchor`, inverted). */
const POSITION: Readonly<Record<XyTextAnchor, string>> = {
  start: 'left',
  middle: 'center',
  end: 'right',
};

/** v12's `verticalPos` for each of the layout's baselines (`getDominantBaseLine`, inverted). */
const V12_POSITION: Readonly<Record<XyBaseline, string>> = {
  top: 'top',
  hanging: 'top',
  middle: 'middle',
  alphabetic: 'bottom',
};

/** The layout baseline the renderer wrote each `dominant-baseline` for: `render.ts`'s map inverted. */
const BASELINE: Readonly<Record<string, XyBaseline>> = Object.fromEntries(
  Object.entries(DOMINANT_BASELINE).map(([b, attr]) => [attr, b as XyBaseline])
);

/** One leaf's v12 drawable data. */
function datum(
  tag: string,
  a: Readonly<Record<string, string>>,
  text: string
): Record<string, unknown> {
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
    text,
    x: Number(t[1]),
    y: Number(t[2]),
    fill: a.fill,
    fontSize: n('font-size'),
    rotation: Number(t[3]),
    verticalPos: V12_POSITION[BASELINE[a['dominant-baseline'] ?? 'middle'] ?? 'middle'],
    horizontalPos: POSITION[(a['text-anchor'] ?? 'middle') as XyTextAnchor],
  };
}

/** v12's drawables from the SVG the renderer wrote. */
function drawables(svg: string): Drawable[] {
  const out: Drawable[] = [];
  const groups: string[] = [];
  let text: { a: Readonly<Record<string, string>>; body: string } | undefined;
  for (const t of svgTokens(svg)) {
    if (t.kind === 'text') {
      if (text) text.body += t.text;
      continue;
    }
    const { tag, attrs: a, closing } = t;
    if (tag === 'g') {
      if (closing) groups.pop();
      else if (!t.empty) groups.push(a.class ?? '');
    } else if (tag === 'text') {
      if (!closing) text = { a, body: '' };
      else if (text) {
        push(out, groups, 'text', datum('text', text.a, text.body));
        text = undefined;
      }
    } else if ((tag === 'rect' || tag === 'path') && groups.length > 0 && a.class !== 'background')
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
    return drawn(model, layout, theme);
  },
};

/**
 * v12 `ChartLegend`: the v13 legend component (`./testing`'s `XyChartLegend`), placed where the
 * spec puts it, drawn by the v13 renderer as part of the whole chart's layout, and read back as
 * the legend's drawables only.
 */
export class ChartLegend {
  private readonly legend: InstanceType<typeof XyChartLegend>;
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
    this.legend = new XyChartLegend(
      this.model,
      options,
      font,
      textMeasure(measurer(calc), undefined)
    );
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
    const chart = layoutXyChart(this.model, {
      config: { xyChart: this.config } as unknown as ResolvedConfig,
      measurer: measurer(),
      theme: this.theme,
    });
    const layout: XyChartLayout = { ...chart, legend };
    return drawn(this.model, layout, this.theme).filter((d) => d.groupTexts[0] === 'legend');
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
