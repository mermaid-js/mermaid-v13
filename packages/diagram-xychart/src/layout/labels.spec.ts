import { beforeAll, describe, expect, it } from 'vitest';
import { Style } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { parseXyChart } from '../parser/index.ts';
import { xyChartTestContext, xyChartTestTheme } from '../test-context.ts';
import type { XyChartModel } from '../model.ts';
import { layoutXyChart, type XyLinePlotLayout } from './index.ts';
import type { XyText } from './types.ts';

// Labels through the label handler (#1368): a quoted markdown string is markdown in every
// label kind, in both modes; any other label is plain, its tags drawn and a written `\n` a break.
let theme: Theme;
beforeAll(async () => {
  theme = await xyChartTestTheme();
});

function parse(source: string): XyChartModel {
  const r = parseXyChart(source);
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return r.model;
}

/** A label's lines, a bold run as `[b:…]` and an italic run as `[i:…]`, lines joined by ` / `. */
const read = (t: XyText): string =>
  t
    .label!.lines.map((runs) =>
      runs
        .map((r) => {
          if (r.style & Style.Bold) return `[b:${r.text}]`;
          return r.style & Style.Italic ? `[i:${r.text}]` : r.text;
        })
        .join('')
    )
    .join(' / ');

/** A chart with `label` in every label kind. */
const src = (label: string): string =>
  `xychart\n  title ${label}\n  x-axis ${label} [${label}, b]\n  y-axis ${label} 0 --> 10\n  line ${label} [1 ${label}, 2]\n`;

const MODES = [{}, { legacyMarkdown: true }] as const;

/** Each mode's readings of the title, the axis titles, a category, the legend and a point label. */
function kinds(label: string): string[][] {
  return MODES.map((extra) => {
    const model = parse(src(label));
    const ctx = xyChartTestContext(theme);
    const layout = layoutXyChart(model, { ...ctx, config: { ...ctx.config, ...extra } });
    const line = layout.plots[0] as XyLinePlotLayout;
    return [
      layout.title!,
      layout.xAxis.title!,
      layout.yAxis.title!,
      layout.xAxis.ticks[0]!.label!,
      layout.legend!.rows[0]!.label,
      line.pointLabels[0]!,
    ].map(read);
  });
}

describe('layoutXyChart: labels through the label handler (#1368)', () => {
  it('reads a quoted markdown string as markdown in every label kind, the parser marking it', () => {
    expect(parse(src('"`**b** _i_`"')).markdownStrings).toEqual(['`**b** _i_`']);
    for (const mode of kinds('"`**b** _i_`"')) expect(mode).toEqual(Array(6).fill('[b:b] [i:i]'));
  });

  it('draws plain markers and a code span as written, tags drawn, a written \\n a break', () => {
    for (const [label, drawn] of [
      ['"**b** _i_"', '**b** _i_'],
      ['"a `code` b"', 'a `code` b'],
      ['"<b>b</b> <i>i</i><br>next"', '[b:b] [i:i] / next'],
      ['"one\\ntwo"', 'one / two'],
      ['"`a` b `c`"', '`a` b `c`'],
    ] as const) {
      expect(parse(src(label)).markdownStrings, label).toBeUndefined();
      for (const mode of kinds(label)) expect(mode, label).toEqual(Array(6).fill(drawn));
    }
  });

  it('keeps a bare backtick a lexical error, as v12 did', () => {
    const r = parseXyChart('xychart\n  title `**b**`\n  bar [1]\n');
    expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('never marks the front-matter title, which is read as written', () => {
    const model = parse('---\ntitle: "`**b**`"\n---\nxychart\n  bar [1]\n');
    expect(model.title).toBe('`**b**`');
    expect(model.markdownStrings).toBeUndefined();
  });

  it('measures a multi-line rotated axis title by its lines', () => {
    const at = (title: string) =>
      layoutXyChart(
        parse(`xychart\n  y-axis "${title}" 0 --> 10\n  bar [1]\n`),
        xyChartTestContext(theme)
      ).yAxis;
    const one = at('`**one**`');
    const two = at('`**one**\\ntwo`');
    expect(read(two.title!)).toBe('[b:one] / two');
    expect(two.title!.rotation).toBe(one.title!.rotation);
    expect(two.box.width).toBeGreaterThan(one.box.width);
  });
});
