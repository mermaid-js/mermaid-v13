import { beforeAll, describe, expect, it } from 'vitest';
import { UnsupportedFormatError, type Mermaid } from 'mermaid';
import { tableMeasurer } from '@mermaid-js/core/text';
import { parseQuadrant, quadrant } from '@mermaid-js/diagram-quadrant';
import { quadrantApi } from './render-api.ts';

/**
 * What the quadrant renderer draws (#312, spec #289 T4), through the public `render()`: v12's
 * groups and classes, its text placement, theme colours (D152, D231), inline paints (D235),
 * core label layout (D225) and a bounding box that covers what is drawn (D224).
 */
let api: Mermaid;
/** Writes literal colours (`output.cssVariables: false`). */
let literal: Mermaid;
beforeAll(async () => {
  api = await quadrantApi();
  literal = await quadrantApi({ output: { cssVariables: false } });
});

const render = async (body: string, config = '', m = api): Promise<string> => {
  const head = config ? `---\nconfig:\n${config}\n---\n` : '';
  return (await m.render('q', `${head}quadrantChart\n${body}`)).svg;
};
const count = (svg: string, re: RegExp): number => svg.match(new RegExp(re, 'g'))?.length ?? 0;
/** The opening tag of the first element whose attributes match `re`. */
const tag = (svg: string, re: RegExp): string =>
  new RegExp(`<[a-z]+[^>]*${re.source}[^>]*>`).exec(svg)?.[0] ?? '';

const CHART = [
  'title Reach and engagement',
  'x-axis Low Reach --> High Reach',
  'y-axis Low Engagement --> High Engagement',
  'quadrant-1 We should expand',
  'quadrant-2 Need to promote',
  'quadrant-3 Re-evaluate',
  'quadrant-4 May be improved',
  'Campaign A: [0.3, 0.6]',
  'Campaign B: [0.45, 0.23]',
].join('\n');

describe('structure', () => {
  it("keeps v12's groups, in v12's order", async () => {
    const svg = await render(CHART);
    const order = [...svg.matchAll(/<g class="([a-z-]+)"/g)].map((m) => m[1]);
    expect(order.filter((c) => !['quadrant', 'data-point', 'label'].includes(c!))).toEqual([
      'main',
      'quadrants',
      'border',
      'data-points',
      'labels',
      'title',
    ]);
    expect(count(svg, /<g class="quadrant"/)).toBe(4);
    expect(count(svg, /<line /)).toBe(6);
    expect(count(svg, /<g class="data-point"/)).toBe(2);
    expect(count(svg, /<g class="label"/)).toBe(4);
  });

  it("keeps v12's empty groups when nothing is in them", async () => {
    const svg = await render('');
    for (const g of ['data-points', 'labels', 'title']) expect(svg).toContain(`<g class="${g}"/>`);
    // A quadrant without a label draws no empty <text> (v12 wrote one; MIGRATION).
    expect(count(svg, /<text/)).toBe(0);
    expect(count(svg, /<g class="quadrant" data-id="quadrant-\d"><rect [^>]*\/><\/g>/)).toBe(4);
  });

  it('draws the last-declared point first, so the first is on top (v12)', async () => {
    const svg = await render('A: [0.1, 0.1]\nB: [0.2, 0.2]\nC: [0.3, 0.3]');
    const ids = [...svg.matchAll(/<g class="data-point" data-id="([^"]*)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['C', 'B', 'A']);
  });

  it('writes no element ids but the a11y title and description', async () => {
    const svg = (await api.render('m-7', 'quadrantChart\naccTitle: T\naccDescr: D\n' + CHART)).svg;
    expect([...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1])).toEqual(['m-7-title', 'm-7-desc']);
    expect(svg).toContain('aria-labelledby="m-7-title"');
    expect(svg).toContain('aria-describedby="m-7-desc"');
  });

  it('puts data-id and data-ast on quadrants, points, axis labels and the title', async () => {
    const svg = await render(CHART);
    expect(svg).toContain('<g class="quadrant" data-id="quadrant-1" data-ast="q:1">');
    expect(svg).toContain('<g class="data-point" data-id="Campaign A" data-ast="pt:Campaign A">');
    expect(svg).toContain('<g class="label" data-id="x-axis-end" data-ast="ax:x/end">');
    expect(svg).toMatch(/<g class="title" data-id="title" data-ast="st:\d+">/);
  });
});

describe('text placement', () => {
  it("keeps v12's anchor, baseline and translate() rotate() placement for plain labels", async () => {
    const svg = await render(CHART);
    expect(tag(svg, /data-ast="ax:y"/)).toBeTruthy();
    const yLabel = /<g class="label" data-id="y-axis-start"[^>]*>(<text[^>]*>)/.exec(svg)![1]!;
    expect(yLabel).toContain('x="0" y="0"');
    expect(yLabel).toContain('dominant-baseline="hanging"');
    expect(yLabel).toContain('text-anchor="middle"');
    expect(yLabel).toMatch(/transform="translate\(5,[\d.]+\) rotate\(-90\)"/);
    // An axis with one label is start-anchored at the edge.
    const lone = await render('x-axis Low');
    expect(tag(lone, /text-anchor="start"/)).toContain('dominant-baseline="hanging"');
    // Without points, quadrant labels are centred (v12 `middle`).
    const empty = await render('quadrant-1 Q');
    expect(tag(empty, /fill="var\(--_q1t\)"/)).toContain('dominant-baseline="middle"');
  });
});

describe('labels (D225)', () => {
  it('stays one <text> for a plain label', async () => {
    const svg = await render('quadrant-1 Plain label');
    expect(svg).toMatch(/<text [^>]*>Plain label<\/text>/);
    expect(svg).not.toContain('<tspan');
  });

  it('breaks a quoted <br> and renders a markdown string', async () => {
    const br = await render('quadrant-1 "one<br>two"');
    expect(count(br, /<tspan /)).toBe(2);
    expect(br).not.toContain('&lt;br');
    const md = await render('quadrant-1 "`**bold** text`"');
    expect(md).toContain('font-weight="bold"');
    expect(md).not.toContain('**');
  });

  it('decodes entities', async () => {
    const svg = await render('quadrant-1 "a #amp; b"');
    expect(svg).toMatch(/>a &amp; b</);
  });

  it('lays a multi-line label out where one line would sit, rotated with it', async () => {
    const svg = await render('y-axis "a<br>b"');
    const text = /<g class="label"[^>]*>(<text[^>]*>)/.exec(svg)![1]!;
    expect(text).toMatch(/transform="translate\(5,[\d.]+\) rotate\(-90\)"/);
    expect(text).toContain('text-anchor="start"');
    expect(text).not.toContain('dominant-baseline');
  });
});

describe('labels hook (D178, D225)', () => {
  it('lists every text the renderer lays out, as written', () => {
    const { model } = parseQuadrant(`quadrantChart\n${CHART}\n"$$x^2$$": [0.1, 0.1]`);
    expect(quadrant.labels(model)).toEqual([
      'Reach and engagement',
      'We should expand',
      'Need to promote',
      'Re-evaluate',
      'May be improved',
      'Low Reach',
      'High Reach',
      'Low Engagement',
      'High Engagement',
      'Campaign A',
      'Campaign B',
      '$$x^2$$',
    ]);
  });
});

describe('colours', () => {
  it('reads every colour from the quadrant theme variables (D152)', async () => {
    const svg = await render(CHART);
    for (const alias of [
      'q1f',
      'q2f',
      'q3f',
      'q4f',
      'q1t',
      'q4t',
      'qeb',
      'qib',
      'qpf',
      'qpt',
      'qxt',
      'qyt',
      'qtf',
    ])
      expect(svg, alias).toContain(`"var(--_${alias})"`);
  });

  it('declares only the aliases it draws with', async () => {
    const svg = await render('');
    expect(svg).toContain('--_q1f:');
    for (const unused of ['q1t', 'qpf', 'qpt', 'qxt', 'qyt', 'qtf'])
      expect(svg).not.toContain(`--_${unused}:`);
  });

  it('paints points with quadrantPointFill, textColor by default (D231)', async () => {
    const lit = async (vars: string): Promise<string> =>
      render('A: [0.5, 0.5]', `  theme: default${vars}`, literal);
    const circle = (svg: string): string => /<circle[^>]*>/.exec(svg)?.[0] ?? '';
    const plain = await lit('');
    expect(circle(plain)).toContain('fill="#333333"');
    const set = await lit('\n  themeVariables:\n    quadrantPointFill: "#0149ff"');
    expect(circle(set)).toContain('fill="#0149ff"');
    // v12's default stroke was the NaN point fill, which browsers ignore: no ring.
    expect(circle(set)).not.toContain('stroke=');
  });

  it('writes inline and class paints as attributes, with the # v12 left out (D235)', async () => {
    const svg = await render(
      [
        'classDef c color: 00ff00, stroke-color: #0000ff, stroke-width: 3px, radius: 9',
        'A: [0.2, 0.2] color: ff0000',
        'B:::c: [0.6, 0.6]',
      ].join('\n')
    );
    const a = /<g class="data-point" data-id="A"[^>]*><circle[^>]*>/.exec(svg)![0];
    expect(a).toContain('fill="#ff0000"');
    expect(a).not.toContain('stroke=');
    const b = /<g class="data-point" data-id="B"[^>]*><circle[^>]*>/.exec(svg)![0];
    expect(b).toContain('fill="#00ff00"');
    expect(b).toContain('stroke="#0000ff"');
    expect(b).toContain('stroke-width="3"');
    expect(b).toContain('r="9"');
  });

  it('draws a stroke only where a stroke colour is set (v12 drew no default ring)', async () => {
    const ring = (svg: string): string => /<circle[^>]*>/.exec(svg)![0];
    const width = ring(await render('A: [0.5, 0.5] stroke-width: 4px'));
    expect(width).not.toContain('stroke=');
    const both = ring(await render('A: [0.5, 0.5] stroke-width: 4px, stroke-color: #00ff00'));
    expect(both).toContain('stroke="#00ff00"');
    expect(both).toContain('stroke-width="4"');
    const cls = ring(await render('classDef c stroke-color: #0000ff\nA:::c: [0.5, 0.5]'));
    expect(cls).toContain('stroke="#0000ff"');
  });

  it('draws every family plain: no gradient, shadow or palette (D227)', async () => {
    for (const theme of ['default', 'redux', 'redux-color', 'neo', 'neo-dark']) {
      const svg = await render(CHART, `  theme: ${theme}`);
      expect(svg, theme).not.toMatch(/url\(#|filter=|<defs|data-color-id|<linearGradient/);
    }
  });

  it('takes the fixture theme variables', async () => {
    const vars =
      '  themeVariables:\n    quadrant1Fill: "#b4dcff"\n    quadrantTitleFill: "#00ea19"';
    const svg = await render(CHART, vars, literal);
    expect(svg).toContain('fill="#b4dcff"');
    expect(svg).toContain('fill="#00ea19"');
  });
});

describe('bounding box (D224)', () => {
  const viewBox = (svg: string): number[] =>
    /viewBox="([^"]*)"/.exec(svg)![1]!.split(' ').map(Number);

  it("is v12's 0 0 chartWidth chartHeight when everything fits", async () => {
    expect(viewBox(await render(CHART))).toEqual([0, 0, 500, 500]);
    const small = await render(
      CHART,
      '  quadrantChart:\n    chartWidth: 400\n    chartHeight: 300'
    );
    expect(viewBox(small)).toEqual([0, 0, 400, 300]);
    expect(small).toContain('max-width:400px');
  });

  it('grows over a point label v12 let run off the chart', async () => {
    const name = 'A point label far too long to fit at the right edge';
    const svg = await render(`${name}: [1, 0.5]`);
    const [x, y, w, h] = viewBox(svg);
    const font = { family: '"Recursive Variable", arial, sans-serif', size: 12, weight: 400 };
    const half = tableMeasurer.width(name, font, 0) / 2;
    // The point is at the square's right edge, chartWidth - quadrantPadding = 495.
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBe(Math.ceil(495 + half));
    expect(h).toBe(500);
    expect(svg).toContain(`max-width:${w}px`);
  });

  it('covers a stroked point at the corner, half its stroke outside the circle', async () => {
    const svg = await render('A: [1, 1] radius: 5, stroke-width: 20px, stroke-color: #ff0000');
    // The point sits at (495, 5): radius 5 plus half of the 20px stroke reaches 15 out.
    expect(viewBox(svg)).toEqual([0, -10, 510, 510]);
    // A stroke width with no stroke colour draws no stroke, so it adds nothing.
    expect(viewBox(await render('A: [1, 1] radius: 5, stroke-width: 20px'))).toEqual([
      0, 0, 500, 500,
    ]);
  });

  it('grows left over a label that starts before 0', async () => {
    const name = 'Another label much too long for the left edge';
    const [x = 0, , w = 0] = viewBox(await render(`${name}: [0, 0.5]`));
    expect(x).toBeLessThan(0);
    expect(x + w).toBe(500);
  });

  it('writes the grown size as width and height without useMaxWidth', async () => {
    const svg = await render(
      'A point label far too long to fit at the right edge: [1, 0.5]',
      '  quadrantChart:\n    useMaxWidth: false'
    );
    const [, , w, h] = viewBox(svg);
    expect(svg).toContain(`width="${w}" height="${h}"`);
  });
});

describe('formats and warnings', () => {
  it("throws UnsupportedFormatError for format: 'ascii' (D216)", async () => {
    const e = await api.render('q', 'quadrantChart\nA: [0.5, 0.5]', { format: 'ascii' }).then(
      () => undefined,
      (x: unknown) => x
    );
    expect(e).toBeInstanceOf(UnsupportedFormatError);
  });

  it('leaves out a point that is not in [0, 1], with one warning (D226)', async () => {
    const r = await api.render('q', 'quadrantChart\nA: [0x5, 0.5]\nB: [0.5, 0.5]');
    expect(r.svg).not.toContain('data-id="A"');
    expect(r.svg).toContain('data-id="B"');
    expect(r.warnings.map((w) => w.code)).toEqual(['QUADRANT_POINT_INVALID']);
  });

  it('shows a front-matter title unless the text has one (D218)', async () => {
    const fm = (await api.render('q', '---\ntitle: From front matter\n---\nquadrantChart\n')).svg;
    expect(fm).toContain('>From front matter</text>');
    expect(fm).toContain('<g class="title" data-id="title">');
    const both = (await api.render('q', '---\ntitle: FM\n---\nquadrantChart\ntitle In text')).svg;
    expect(both).toContain('>In text</text>');
    expect(both).not.toContain('>FM<');
  });
});
