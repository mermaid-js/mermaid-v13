// The XY chart renderer (spec #426 T4) through the plugin's own seam: parsed sources laid out and
// drawn with core's render context (`renderXyChartForTest`). Structure and v12's classes, the
// AST ids (pitfall 12), the plot colours (D381, D382, D384), text, the root (D133, D387). The
// theme table is `theme/table.spec.ts`; the corpus properties are
// `conformance/src/xychart/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import { renderXyChartForTest } from './harness.ts';

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<(?:${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = { tag: /<([\w:]+)/.exec(m[0])![1]! };
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

/** The inner markup of the first `<g class="cls" …>` (groups nest, so it counts them). */
function group(svg: string, cls: string): string {
  const open = new RegExp(`<g class="${cls}"[^>]*>`).exec(svg);
  if (!open) throw new Error(`no g.${cls}`);
  let depth = 1;
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = open.index + open[0].length;
  for (let m = re.exec(svg); m; m = re.exec(svg)) {
    if (m[0] === '</g>') depth--;
    else if (m[1] !== '/') depth++;
    if (depth === 0) return svg.slice(open.index + open[0].length, m.index);
  }
  throw new Error(`g.${cls} not closed`);
}

/** The classes of the `<g>`s, in document order. */
const groupClasses = (svg: string): string[] => elements(svg, 'g').map((g) => g.class ?? '');

const CHART = `xychart
  title "Sales"
  x-axis Months [jan, feb, mar]
  y-axis "Revenue" 0 --> 100
  line Trend [20 "low", 40, 90 "peak"]
  bar Sales [10, 50, 80]
  bar [30, 60, 70]
`;

const LITERAL = { cssVariables: false } as const;

describe('structure (spec #426 Renderer)', () => {
  it("draws g.main with rect.background, then v12's groups in v12's order and nesting", async () => {
    const { svg } = await renderXyChartForTest(CHART);
    expect(groupClasses(svg)).toEqual([
      'main',
      'chart-title',
      'plot',
      'line-plot-0',
      'labels',
      'bar-plot-1',
      'bar-plot-2',
      'legend',
      'markers',
      'label',
      'bottom-axis',
      'axis-line',
      'label',
      'ticks',
      'title',
      'left-axis',
      'axisl-line',
      'label',
      'ticks',
      'title',
    ]);
    expect(svg).toMatch(/<g class="main"><rect width="700" height="500" class="background" /);
    expect(group(svg, 'plot')).toMatch(/^<g class="line-plot-0"/);
    expect(group(svg, 'line-plot-0')).toMatch(/^<path [^>]*\/><g class="labels">/);
    // v12's measuring group and element ids are gone.
    expect(svg).not.toMatch(/mermaid-tmp-group|\sid="|NaN|undefined|foreignObject|<style/);
    expect(svg).toMatch(
      /<svg [^>]*class="mermaid mermaid-xychart"[^>]*aria-roledescription="xychart"/
    );
  });

  it('puts the data axis on the left and the value axis on top when horizontal', async () => {
    const { svg } = await renderXyChartForTest(CHART.replace('xychart', 'xychart horizontal'));
    const axes = groupClasses(svg).filter((c) => c.endsWith('-axis'));
    expect(axes).toEqual(['left-axis', 'top-axis']);
    expect(group(svg, 'left-axis')).toMatch(/^<g class="axisl-line">/);
    expect(group(svg, 'top-axis')).toMatch(/^<g class="axis-line">/);
  });

  it('writes no group for hidden parts: an axis with everything hidden has none', async () => {
    const hidden = { showLabel: false, showTitle: false, showTick: false, showAxisLine: false };
    const { svg } = await renderXyChartForTest(CHART, {
      config: { xyChart: { xAxis: hidden, yAxis: { showTick: false }, showLegend: false } },
    });
    const classes = groupClasses(svg);
    expect(classes).not.toContain('bottom-axis');
    expect(classes).not.toContain('legend');
    expect(group(svg, 'left-axis')).not.toContain('class="ticks"');
    const { svg: untitled } = await renderXyChartForTest(CHART.replace('  title "Sales"\n', ''));
    expect(groupClasses(untitled)).not.toContain('chart-title');
  });

  it("draws bars as filled rects with v12's zero stroke, and lines as unfilled paths of width 2", async () => {
    const { svg, layout } = await renderXyChartForTest(CHART, LITERAL);
    const bars = elements(group(svg, 'bar-plot-1'), 'rect');
    const plot = layout.plots[1]!;
    expect(plot.kind === 'bar' && plot.bars.length).toBe(3);
    expect(bars).toHaveLength(3);
    for (const b of bars) expect([b['stroke-width'], b.stroke]).toEqual(['0', b.fill]);
    const [line] = elements(group(svg, 'line-plot-0'), 'path');
    expect([line!.fill, line!['stroke-width']]).toEqual(['none', '2']);
    expect(line!.d).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+L[\d.]+,[\d.]+$/);
  });
});

describe('AST ids (R-PARSE-8, pitfall 12)', () => {
  it('puts data-ast on each plot group, each axis group and the title group, once each', async () => {
    const { svg } = await renderXyChartForTest(CHART);
    const withAst = elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined);
    expect(withAst.map((e) => [e.class, e['data-ast']])).toEqual([
      ['chart-title', 'title'],
      ['line-plot-0', 'plot:1'],
      ['bar-plot-1', 'plot:2'],
      ['bar-plot-2', 'plot:3'],
      ['bottom-axis', 'x-axis'],
      ['left-axis', 'y-axis'],
    ]);
    expect(withAst.every((e) => e['data-id'] === undefined)).toBe(true);
  });

  it('gives bars, lines, point labels, data labels and legend rows their plot id as data-id only', async () => {
    const { svg } = await renderXyChartForTest(CHART, {
      config: { xyChart: { showDataLabel: true } },
    });
    const ids = (cls: string, tag: string) =>
      elements(group(svg, cls), tag).map((e) => e['data-id']);
    expect(ids('line-plot-0', 'path|text')).toEqual(['plot:1', 'plot:1', 'plot:1']);
    expect(ids('bar-plot-1', 'rect|text')).toEqual(Array(6).fill('plot:2'));
    expect(ids('markers', 'rect|path')).toEqual(['plot:2', 'plot:1']);
    expect(ids('legend', 'text')).toEqual(['plot:1', 'plot:2']);
    // Axis parts and the title text carry none.
    expect(ids('bottom-axis', 'path|text').every((id) => id === undefined)).toBe(true);
    expect(ids('chart-title', 'text')).toEqual([undefined]);
  });

  it('gives a front-matter title no data-ast, and a later axis statement the id', async () => {
    const src = `---\ntitle: From front matter\n---\nxychart\n  x-axis [a, b]\n  x-axis "T" [c, d]\n  bar [1, 2]\n`;
    const { svg } = await renderXyChartForTest(src);
    expect(svg).toMatch(/<g class="chart-title"><text /);
    expect(elements(svg, 'g').find((g) => g.class === 'bottom-axis')!['data-ast']).toBe('x-axis@2');
  });
});

describe('colours (D381, D382, D384)', () => {
  it("takes plot n's colour from slot n of the palette across both kinds, cycling past its end", async () => {
    const palette = ['#111111', '#222222', '#333333'];
    const plots = Array.from({ length: 5 }, (_, i) => (i % 2 ? 'line' : 'bar') + ' [1, 2]').join(
      '\n'
    );
    const { svg } = await renderXyChartForTest(`xychart\n${plots}\n`, {
      ...LITERAL,
      config: { themeVariables: { xyChart: { plotColorPalette: palette.join(', ') } } },
    });
    const colours = [0, 1, 2, 3, 4].map((i) => {
      const cls = i % 2 ? `line-plot-${i}` : `bar-plot-${i}`;
      const [e] = elements(group(svg, cls), 'rect|path');
      return e!.tag === 'rect' ? e!.fill : e!.stroke;
    });
    expect(colours).toEqual(['#111111', '#222222', '#333333', '#111111', '#222222']);
  });

  it('labels each bar plot with its own values (D382) in xyChartDataLabelColor', async () => {
    const { svg } = await renderXyChartForTest(CHART, {
      ...LITERAL,
      config: {
        xyChart: { showDataLabel: true },
        themeVariables: { xyChartDataLabelColor: '#ab0000' },
      },
    });
    const texts = (cls: string) => [...group(svg, cls).matchAll(/<text ([^>]*)>([^<]*)</g)];
    expect(texts('bar-plot-1').map((m) => m[2])).toEqual(['10', '50', '80']);
    expect(texts('bar-plot-2').map((m) => m[2])).toEqual(['30', '60', '70']);
    for (const m of [...texts('bar-plot-1'), ...texts('bar-plot-2')])
      expect(m[1]).toMatch(/fill="#ab0000".*dominant-baseline="hanging" text-anchor="middle"/);
  });

  it('draws point labels in the line colour (D384), not the data-label colour', async () => {
    const { svg } = await renderXyChartForTest(CHART, {
      ...LITERAL,
      config: { themeVariables: { plotColorArray: ['#123456'], xyChartDataLabelColor: '#ab0000' } },
    });
    const labels = elements(group(svg, 'labels'), 'text');
    expect(labels.map((l) => l.fill)).toEqual(['#123456', '#123456']);
    expect(svg).toMatch(/>low<\/text>.*>peak<\/text>/);
  });

  it('places data labels outside bars and in horizontal charts as v12 did', async () => {
    const outside = await renderXyChartForTest(CHART, {
      config: { xyChart: { showDataLabel: true, showDataLabelOutsideBar: true } },
    });
    expect(group(outside.svg, 'bar-plot-1')).toMatch(
      /<text [^>]*dominant-baseline="auto" text-anchor="middle"/
    );
    const across = await renderXyChartForTest(CHART.replace('xychart', 'xychart horizontal'), {
      config: { xyChart: { showDataLabel: true } },
    });
    expect(group(across.svg, 'bar-plot-1')).toMatch(
      /<text [^>]*dominant-baseline="middle" text-anchor="end"/
    );
  });
});

describe('text (D385)', () => {
  it("writes one-line text as v12's text at translate() rotate(), with v12's baselines", async () => {
    const { svg } = await renderXyChartForTest(CHART);
    const [title] = elements(group(svg, 'title'), 'text');
    expect(title).toMatchObject({
      x: '0',
      y: '0',
      'dominant-baseline': 'text-before-edge',
      'text-anchor': 'middle',
    });
    expect(title!.transform).toMatch(/^translate\([\d.]+,[\d.]+\) rotate\(0\)$/);
    const [yTitle] = elements(group(svg, 'left-axis'), 'text').slice(-1);
    expect(yTitle!.transform).toMatch(/rotate\(270\)$/);
    const ticks = elements(group(svg, 'left-axis'), 'text').slice(0, -1);
    expect(
      ticks.every((t) => t['dominant-baseline'] === 'middle' && t['text-anchor'] === 'end')
    ).toBe(true);
    expect(elements(group(svg, 'legend'), 'text').every((t) => t['text-anchor'] === 'start')).toBe(
      true
    );
  });

  it('draws a label with a line break through the label writer, in the rotated frame', async () => {
    const { svg, layout } = await renderXyChartForTest(
      'xychart\n  title "Two<br>lines"\n  y-axis "Up<br>here"\n  bar Sales [1, 2]\n'
    );
    const title = group(svg, 'chart-title');
    expect(title).toMatch(
      /^<text [^>]*transform="translate\([\d.]+,[\d.]+\) rotate\(0\)"[^>]*><tspan x="0" y="[-\d.]+">Two<\/tspan><tspan x="0" y="[-\d.]+">lines<\/tspan><\/text>$/
    );
    const yTitle = group(group(svg, 'left-axis'), 'title');
    expect(yTitle).toMatch(/rotate\(270\)/);
    expect(yTitle).toMatch(/>Up<\/tspan><tspan [^>]*>here</);
    expect(layout.title!.label!.lines).toHaveLength(2);
  });

  it('escapes text', async () => {
    const { svg } = await renderXyChartForTest('xychart\n  x-axis ["<b>&", "x"]\n  bar [1, 2]\n');
    expect(svg).not.toMatch(/<b>/);
  });
});

describe('root (D133, D387)', () => {
  it('names the diagram with accTitle and accDescr only, by the two ids', async () => {
    const { svg } = await renderXyChartForTest(
      'xychart\n  accTitle: Revenue\n  accDescr: By month\n  bar [1, 2]\n',
      { idPrefix: 'x-1' }
    );
    expect(svg).toMatch(/aria-labelledby="x-1-title" aria-describedby="x-1-desc"/);
    expect(svg).toMatch(
      /<title id="x-1-title">Revenue<\/title><desc id="x-1-desc">By month<\/desc>/
    );
    expect([...svg.matchAll(/\sid="/g)]).toHaveLength(2);
  });

  it('scales to the container by default and honours useMaxWidth: false (D387)', async () => {
    const scaled = await renderXyChartForTest(CHART);
    expect(scaled.svg).toMatch(
      /<svg [^>]*viewBox="0 0 700 500" width="100%" [^>]*style="max-width:700px;/
    );
    const fixed = await renderXyChartForTest(CHART, {
      config: { xyChart: { useMaxWidth: false } },
    });
    expect(fixed.svg).toMatch(/<svg [^>]*width="700" height="500"/);
    expect(fixed.svg).not.toMatch(/max-width/);
  });

  it('draws a chart with missing values and an empty range without NaN (D383)', async () => {
    const { svg, warnings } = await renderXyChartForTest(
      'xychart\n  x-axis [a, b, c]\n  y-axis 5 --> 5\n  line [1]\n  bar [2]\n'
    );
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(groupClasses(svg)).toEqual(expect.arrayContaining(['line-plot-0', 'bar-plot-1']));
    expect(warnings.map((w) => w.code).sort()).toEqual([
      'XYCHART_EMPTY_RANGE',
      'XYCHART_MISSING_VALUE',
    ]);
  });
});
