// The colours the XY chart renderer draws with (spec #426 §Renderer, D215, D227): the plot
// palette `xyChartPlotColorPalette` (D545; plot `index` takes slot `index` mod its length, as
// v12's `getPlotColorFromPalette`), and the thirteen `xyChart*` colours of the plugin's theme
// table, one of them for data labels outside the bars (D749). Each name is written as a literal, so the vocabulary `usedBy` scan
// (`theme-used-by.spec.ts`) sees it. The XY chart has no theme-name or `look` branch (D227).
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import type { XyAxisLayout, XyChartLayout } from '../layout/index.ts';

type Theme = RenderContext['theme'];

/** One axis's four colours. */
export interface AxisPaints {
  readonly title: Paint;
  readonly label: Paint;
  readonly tick: Paint;
  readonly line: Paint;
}

export interface Paints {
  readonly background: Paint;
  readonly title: Paint;
  /** Data labels inside the bars. */
  readonly dataLabel: Paint;
  /** Data labels outside the bars, on the canvas (D749). */
  readonly dataLabelOutside: Paint;
  readonly legendText: Paint;
  readonly xAxis: AxisPaints;
  readonly yAxis: AxisPaints;
  /** Plot `index`'s colour: a bar's fill and stroke, a line's stroke and its point labels (D384). */
  readonly plot: (index: number) => Paint;
}

type AxisNames = Readonly<Record<keyof AxisPaints, string>>;

const X_AXIS: AxisNames = {
  title: 'xyChartXAxisTitleColor',
  label: 'xyChartXAxisLabelColor',
  tick: 'xyChartXAxisTickColor',
  line: 'xyChartXAxisLineColor',
};

const Y_AXIS: AxisNames = {
  title: 'xyChartYAxisTitleColor',
  label: 'xyChartYAxisLabelColor',
  tick: 'xyChartYAxisTickColor',
  line: 'xyChartYAxisLineColor',
};

/**
 * `currentColor`, as core's DSL: past the end of an empty palette, and for a paint nothing drawn
 * uses, so that its alias is not declared.
 */
const CURRENT_COLOR: Paint = 'currentColor';

/** The axis's colours, each read only when the axis draws that part. */
function axisPaints(theme: Theme, a: XyAxisLayout, names: AxisNames): AxisPaints {
  const drawn: Readonly<Record<keyof AxisPaints, boolean>> = {
    title: a.title !== undefined,
    label: a.ticks.some((t) => t.label !== undefined),
    tick: a.ticks.some((t) => t.line !== undefined),
    line: a.line !== undefined,
  };
  const paint = (part: keyof AxisPaints): Paint =>
    drawn[part] ? theme.color(names[part]) : CURRENT_COLOR;
  return { title: paint('title'), label: paint('label'), tick: paint('tick'), line: paint('line') };
}

/**
 * Every paint the chart uses, read before the root is written so that it declares their
 * aliases: only the ones something drawn uses.
 */
export function paints(theme: Theme, layout: XyChartLayout): Paints {
  const palette = theme.palette('xyChartPlotColorPalette');
  const labelled = (outside: boolean) =>
    layout.plots.some(
      (p) =>
        p.kind === 'bar' && p.dataLabels.length > 0 && (p.dataLabelsOutside === true) === outside
    );
  return {
    background: theme.color('xyChartBackgroundColor'),
    title: layout.title ? theme.color('xyChartTitleColor') : CURRENT_COLOR,
    dataLabel: labelled(false) ? theme.color('xyChartDataLabelColor') : CURRENT_COLOR,
    dataLabelOutside: labelled(true) ? theme.color('xyChartDataLabelOutsideColor') : CURRENT_COLOR,
    legendText: layout.legend ? theme.color('xyChartLegendTextColor') : CURRENT_COLOR,
    xAxis: axisPaints(theme, layout.xAxis, X_AXIS),
    yAxis: axisPaints(theme, layout.yAxis, Y_AXIS),
    plot: (index) => palette[index % palette.length] ?? CURRENT_COLOR,
  };
}
