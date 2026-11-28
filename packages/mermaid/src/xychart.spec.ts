import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { xychart } from '@mermaid-js/diagram-xychart';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// XY charts are a first-party type (#513): `xychart` and `xychart-beta` go to
// `@mermaid-js/diagram-xychart` through the generated registry, after packet and before block as
// in v12, and no longer fail with UNSUPPORTED_DIAGRAM (R-COMPAT-7). The plugin id is `xychart`;
// its config section keeps v12's name, `xyChart` (`configSection`), from every source.
const TEXT = [
  'xychart',
  '  title "Sales Revenue"',
  '  x-axis Months [jan, feb, mar]',
  '  y-axis "Revenue" 4000 --> 11000',
  '  bar [5000, 6000, 7500]',
  '  line [5000, 6000, 7500]',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string, text = TEXT) => `---\nconfig:\n  xyChart:\n${body}---\n${text}`;
const viewBox = (svg: string) => /viewBox="([^"]*)"/.exec(svg)?.[1];
const count = (svg: string, cls: string): number =>
  svg.match(new RegExp(`class="${cls}[" ]`, 'g'))?.length ?? 0;

describe('XY charts through the public API (#513)', () => {
  it('renders xychart and xychart-beta, which were UNSUPPORTED_DIAGRAM before', async () => {
    const m = createMermaid();
    const result = await m.render('x', TEXT);
    expect(result.diagramType).toBe('xychart');
    expect(result.svg).toContain('aria-roledescription="xychart"');
    expect(result.svg).toContain('class="mermaid mermaid-xychart"');
    expect(count(result.svg, 'bar-plot-0')).toBe(1);
    expect(count(result.svg, 'line-plot-1')).toBe(1);
    expect(result.svg).toContain('>Sales Revenue</text>');
    expect(result.svg).toContain('>feb</text>');
    expect(result.warnings).toEqual([]);
    // v12's 700 × 500 canvas; the viewBox grows to cover the axis strokes (D224).
    expect(result.width).toBe(701);
    expect(viewBox(result.svg)).toBe('0 0 701 500');
    assertInert(result.svg);
    const beta = await m.render('x', TEXT.replace('xychart', 'xychart-beta'));
    expect(beta.diagramType).toBe('xychart');
    expect(beta.svg).toBe(result.svg);
  });

  it('keeps v12’s detector pattern and place, after packet and before block', async () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('xychart')).toBe(types.indexOf('packet') + 1);
    expect(types.indexOf('block')).toBe(types.indexOf('xychart') + 1);
    const m = createMermaid();
    expect(m.detectType('  xychart\n  bar [1]')).toBe('xychart');
    // v12's detector is case-sensitive.
    const upper = await rejection(m.render('x', 'XYCHART\n  bar [1]\n'));
    expect((upper as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('reports what v12 rejects as a positioned SYNTAX MermaidError, no plot included', async () => {
    const m = createMermaid();
    const e = await rejection(m.render('x', 'xychart\n  bar [1, 2\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBe(2);
    // `No Plot to render…` stays a rejection (D383).
    const empty = await rejection(m.render('x', 'xychart\n  title "Nothing"\n'));
    expect((empty as MermaidError).code).toBe('SYNTAX');
  });

  it('draws a front-matter title, and an in-text title wins (D218)', async () => {
    const m = createMermaid();
    const fm = await m.render('x', '---\ntitle: From front matter\n---\nxychart\n  bar [1, 2]\n');
    expect(fm.svg).toContain('>From front matter</text>');
    const both = await m.render('x', `---\ntitle: Front\n---\n${TEXT}`);
    expect(both.svg).toContain('>Sales Revenue</text>');
    expect(both.svg).not.toContain('>Front</text>');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('xychart');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('xychart', 'svg')).toBe(true);
    expect(m.supportsFormat('xychart', 'ascii')).toBe(false);
    const e = await rejection(m.render('x', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('xychart');
  });

  it('renders through mermaid/slim with the xychart plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [xychart] });
    expect((await slim.render('x', TEXT)).svg).toBe((await createMermaid().render('x', TEXT)).svg);
  });

  it('warns once per kind for what v12 drew as NaN or Infinity (D383)', async () => {
    const r = await createMermaid().render('x', 'xychart\n  x-axis [a, b, c]\n  bar [1]\n');
    // One value: the inferred y range is empty too.
    expect(r.warnings.map((w) => w.code)).toEqual(['XYCHART_EMPTY_RANGE', 'XYCHART_MISSING_VALUE']);
    expect(r.svg).not.toMatch(/NaN|Infinity/);
  });

  it('draws the data labels that fit with an automatic y range, without a warning (#537, D611)', async () => {
    const m = createMermaid();
    for (const body of [
      '    showDataLabel: true\n',
      '    showDataLabel: true\n    chartOrientation: horizontal\n',
    ]) {
      const r = await m.render('x', withConfig(body, 'xychart\n  bar [10, 30, 11]\n'));
      // The inferred range starts at 10, so that bar is too short for its label; the others fit.
      const labels = [...r.svg.matchAll(/<g class="bar-plot-0"[^]*?<\/g>/g)]
        .flatMap(([g]) => [...g.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((t) => t[1]))
        .sort();
      expect(labels, body).toEqual(['11', '30']);
      expect(r.warnings, body).toEqual([]);
    }
  });

  it('draws the data labels of every bar plot at one size (#1308, D748)', async () => {
    const text = [
      'xychart',
      '  x-axis [mon, tue, wed, thu, fri, sat, sun]',
      '  y-axis -20 --> 40',
      '  bar first [12.5, -8, 22, 31, 18, 5, -15]',
      '  bar second [3, 9, -4, 14, 27, 33, 21]',
      '  line trend [10, 4, 12, 25, 20, 18, -2]',
      '',
    ].join('\n');
    const r = await createMermaid().render('x', withConfig('    showDataLabel: true\n', text));
    const sizes = (plot: number) =>
      [...r.svg.matchAll(new RegExp(`<g class="bar-plot-${plot}"[^]*?</g>`, 'g'))].flatMap(([g]) =>
        [...g.matchAll(/<text [^>]*font-size="([^"]*)"/g)].map((t) => t[1])
      );
    expect(sizes(0).length).toBeGreaterThan(0);
    expect(sizes(1).length).toBeGreaterThan(0);
    expect(new Set([...sizes(0), ...sizes(1)]).size).toBe(1);
  });
});

describe('the xyChart config section through render() (#513, D387)', () => {
  const m = createMermaid();
  const plain = m.render('x', TEXT);

  it('reads each top-level key and each axis key from front matter', async () => {
    const keys = [
      '    width: 900\n',
      '    height: 600\n',
      '    titleFontSize: 30\n',
      '    titlePadding: 30\n',
      '    showDataLabel: true\n',
      '    showTitle: false\n',
      '    chartOrientation: horizontal\n',
      '    plotReservedSpacePercent: 95\n',
      '    useMaxWidth: false\n',
      ...[
        'showLabel: false',
        'labelFontSize: 20',
        'labelPadding: 15',
        'showTitle: false',
        'titleFontSize: 25',
        'titlePadding: 15',
        'showTick: false',
        'tickLength: 15',
        'tickWidth: 5',
        'showAxisLine: false',
        'axisLineWidth: 6',
        'labelRotation: 45',
      ].flatMap((k) => [`    xAxis:\n      ${k}\n`, `    yAxis:\n      ${k}\n`]),
    ];
    for (const body of keys) {
      const r = await m.render('x', withConfig(body));
      expect(r.warnings, body).toEqual([]);
      // v12 rotates the labels of the bottom axis only, never the y axis (left or top).
      if (body === '    yAxis:\n      labelRotation: 45\n') {
        expect(r.svg).toBe((await plain).svg);
      } else expect(r.svg, body).not.toBe((await plain).svg);
    }
    // The legend needs a named plot.
    const named = TEXT.replace('  bar [', '  bar Sales [');
    const legend = await m.render('x', named);
    expect(count(legend.svg, 'legend')).toBe(1);
    for (const body of [
      '    showLegend: false\n',
      '    legendFontSize: 30\n',
      '    legendPadding: 40\n',
    ])
      expect((await m.render('x', withConfig(body, named))).svg, body).not.toBe(legend.svg);
    const inside = await m.render('x', withConfig('    showDataLabel: true\n'));
    const outside = await m.render(
      'x',
      withConfig('    showDataLabel: true\n    showDataLabelOutsideBar: true\n')
    );
    expect(outside.svg).not.toBe(inside.svg);
  });

  it('scales to the container by default and honours useMaxWidth: false (D387)', async () => {
    expect((await plain).svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('x', withConfig('    useMaxWidth: false\n'));
    expect(fixed.svg).toMatch(/<svg[^>]* width="701"/);
    expect(viewBox((await m.render('x', withConfig('    width: 900\n'))).svg)).toBe('0 0 901 500');
  });

  it('reads the section from %%{init}, its config key and initialize() alike', async () => {
    const want = (await m.render('x', withConfig('    width: 900\n    showDataLabel: true\n'))).svg;
    const init = `%%{init: {"xyChart": {"width": 900, "showDataLabel": true}}}%%\n${TEXT}`;
    expect((await m.render('x', init)).svg).toBe(want);
    const key = `%%{init: {"config": {"width": 900, "showDataLabel": true}}}%%\n${TEXT}`;
    expect((await m.render('x', key)).svg).toBe(want);
    const site = createMermaid();
    site.initialize({ xyChart: { width: 900, showDataLabel: true } });
    expect((await site.render('x', TEXT)).svg).toBe(want);
    // The in-text orientation wins over the section's, as in v12.
    const horizontal = TEXT.replace('xychart', 'xychart horizontal');
    expect(
      (await m.render('x', withConfig('    chartOrientation: vertical\n', horizontal))).svg
    ).toBe((await m.render('x', withConfig('    chartOrientation: horizontal\n'))).svg);
  });

  it('hands the layout the xyChart section with its defaults, not an xychart one', async () => {
    let seen: Readonly<Record<string, unknown>> | undefined;
    const spy = {
      ...xychart,
      layout: (...args: Parameters<typeof xychart.layout>) => {
        seen = args[1].config;
        return xychart.layout(...args);
      },
    };
    const s = createMermaid();
    await s.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
    await s.render('x', `%%{init: {"config": {"width": 800}}}%%\n${TEXT}`);
    expect(seen?.xyChart).toMatchObject({ ...xychart.configDefaults, width: 800 });
    expect(seen?.xychart).toBeUndefined();
  });

  it('accepts useWidth and v12’s leaked "$ref" axis key without a warning (ignored)', async () => {
    const set = await m.render('x', withConfig('    useWidth: 900\n'));
    expect(set.warnings).toEqual([]);
    expect(set.svg).toBe((await plain).svg);
    const ref = await m.render(
      'x',
      withConfig(`    xAxis:\n      $ref: '#/$defs/XYChartAxisConfig'\n`)
    );
    expect(ref.warnings).toEqual([]);
    expect(ref.svg).toBe((await plain).svg);
  });

  it('takes any number as v12 did, also outside the schema range', async () => {
    const low = await m.render(
      'x',
      withConfig('    titlePadding: -5\n    xAxis:\n      labelFontSize: 0.5\n')
    );
    expect(low.warnings).toEqual([]);
    expect(low.svg).not.toBe((await plain).svg);
    // A numeric string reads as its number.
    const text = await m.render('x', withConfig('    width: "900"\n'));
    expect(text.warnings).toEqual([]);
    expect(viewBox(text.svg)).toBe('0 0 901 500');
  });

  it('warns once per bad key and draws with the default', async () => {
    const bad = await m.render(
      'x',
      withConfig(
        '    width: wide\n    showLegend: maybe\n    chartOrientation: diagonal\n    xAxis:\n      tickLength: long\n'
      )
    );
    expect(bad.warnings.map((w) => [w.code, w.path])).toEqual([
      ['XYCHART_CONFIG_INVALID', 'xyChart.width'],
      ['XYCHART_CONFIG_INVALID', 'xyChart.showLegend'],
      ['XYCHART_CONFIG_INVALID', 'xyChart.chartOrientation'],
      ['XYCHART_CONFIG_INVALID', 'xyChart.xAxis.tickLength'],
    ]);
    expect(bad.svg).toBe((await plain).svg);
  });
});

describe('XY chart theme variables through render() (#513, D335, D540)', () => {
  it('takes a nested themeVariables.xyChart colour and palette, and the flat name over it', async () => {
    const t = createMermaid();
    t.initialize({
      theme: 'redux',
      output: { cssVariables: false },
      themeVariables: { xyChart: { titleColor: '#123456', plotColorPalette: '#abcdef, #fedcba' } },
    });
    const nested = (await t.render('x', TEXT)).svg;
    expect(nested).toContain('#123456');
    expect(nested).toContain('#abcdef');
    expect(nested).toContain('#fedcba');
    t.initialize({
      theme: 'redux',
      output: { cssVariables: false },
      themeVariables: { xyChartTitleColor: '#654321', xyChart: { titleColor: '#123456' } },
    });
    const flat = (await t.render('x', TEXT)).svg;
    expect(flat).toContain('#654321');
    expect(flat).not.toContain('#123456');
  });
});
