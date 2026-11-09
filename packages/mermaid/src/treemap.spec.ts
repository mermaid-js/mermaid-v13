import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { treemap } from '@mermaid-js/diagram-treemap';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// Treemaps are a first-party type (#514): `treemap` and `treemap-beta` go to
// `@mermaid-js/diagram-treemap` through the generated registry, after ishikawa and before the
// railroad rows as in v12, and no longer fail with UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const TEXT = [
  'treemap',
  '  title Budget',
  '  "Operations"',
  '    "Salaries": 700',
  '    "Rent": 300',
  '  "Marketing"',
  '    "Ads": 1500',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string, text = TEXT) => `---\nconfig:\n  treemap:\n${body}---\n${text}`;
const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
const count = (svg: string, cls: string): number =>
  svg.match(new RegExp(`class="${cls}[" ]`, 'g'))?.length ?? 0;
/** The `x` of each leaf rect, in order. */
const leafXs = (svg: string): number[] =>
  [...svg.matchAll(/<rect class="treemapLeaf"[^>]* x="([^"]*)"/g)].map((m) => Number(m[1]));

describe('treemaps through the public API (#514)', () => {
  it('renders treemap and treemap-beta, which were UNSUPPORTED_DIAGRAM before', async () => {
    const m = createMermaid();
    const result = await m.render('t', TEXT);
    expect(result.diagramType).toBe('treemap');
    expect(result.svg).toContain('aria-roledescription="treemap"');
    expect(result.svg).toContain('class="mermaid mermaid-treemap"');
    expect(result.svg.match(/<g class="treemapSection"/g)).toHaveLength(2);
    expect(count(result.svg, 'treemapLeaf')).toBe(3);
    expect(result.svg).toContain('>Salaries</text>');
    expect(result.svg).toContain('>1,500</text>');
    expect(result.svg).toContain('>Budget</text>');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
    const beta = await m.render('t', TEXT.replace('treemap', 'treemap-beta'));
    expect(beta.diagramType).toBe('treemap');
    expect(beta.svg).toBe(result.svg);
  });

  it('keeps v12’s detector pattern and place, after ishikawa and before railroad', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('treemap')).toBe(types.indexOf('ishikawa') + 1);
    expect(types.indexOf('railroad')).toBe(types.indexOf('treemap') + 1);
    const m = createMermaid();
    expect(m.detectType('  treemap\n"a": 1')).toBe('treemap');
    expect(m.detectType('treemap-beta\n"a": 1')).toBe('treemap');
  });

  it('rejects text v12 rejects with SYNTAX, at the line', async () => {
    const e = await rejection(createMermaid().render('t', 'treemap\n  "a": 1\n  "b": -1\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBe(3);
  });

  it('draws a front-matter title, and an in-text title wins (D218)', async () => {
    const m = createMermaid();
    const body = 'treemap\n  "a": 1\n';
    const fm = await m.render('t', `---\ntitle: From front matter\n---\n${body}`);
    expect(fm.svg).toContain('>From front matter</text>');
    const both = await m.render('t', `---\ntitle: From front matter\n---\n${body}  title Own\n`);
    expect(both.svg).toContain('>Own</text>');
    expect(both.svg).not.toContain('From front matter');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('treemap');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('treemap', 'svg')).toBe(true);
    expect(m.supportsFormat('treemap', 'ascii')).toBe(false);
    const e = await rejection(m.render('t', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('treemap');
  });

  it('renders through mermaid/slim with the treemap plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [treemap] });
    expect((await slim.render('t', TEXT)).svg).toBe((await createMermaid().render('t', TEXT)).svg);
  });
});

describe('the treemap config section through render() (#514)', () => {
  const m = createMermaid();
  const plain = m.render('t', TEXT);

  it('useMaxWidth: on by default, false draws at its own width', async () => {
    expect((await plain).svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('t', withConfig('    useMaxWidth: false\n'));
    expect(fixed.warnings).toEqual([]);
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d/);
  });

  it('showValues: false prints no value', async () => {
    expect(count((await plain).svg, 'treemapValue')).toBeGreaterThan(0);
    expect(count((await plain).svg, 'treemapSectionValue')).toBeGreaterThan(0);
    const bare = await m.render('t', withConfig('    showValues: false\n'));
    expect(bare.warnings).toEqual([]);
    expect(count(bare.svg, 'treemapValue')).toBe(0);
    expect(count(bare.svg, 'treemapSectionValue')).toBe(0);
    expect(count(bare.svg, 'treemapLeaf')).toBe(3);
  });

  it('nodeWidth and nodeHeight set the canvas (× 10), 0 is v12’s 960 × 500', async () => {
    const [, , w0, h0] = viewBox((await plain).svg);
    const wide = viewBox((await m.render('t', withConfig('    nodeWidth: 150\n'))).svg);
    expect(wide[2]! - w0!).toBeCloseTo(500, 0);
    expect(wide[3]).toBe(h0);
    const tall = viewBox((await m.render('t', withConfig('    nodeHeight: 60\n'))).svg);
    expect(tall[3]! - h0!).toBeCloseTo(200, 0);
    const zero = await m.render('t', withConfig('    nodeWidth: 0\n    nodeHeight: 0\n'));
    expect(zero.warnings).toEqual([]);
    const z = viewBox(zero.svg);
    expect(z[2]! - w0!).toBeCloseTo(-40, 0);
    expect(z[3]! - h0!).toBeCloseTo(100, 0);
  });

  it('diagramPadding pads the viewBox on every side', async () => {
    const [x0, y0, w0, h0] = viewBox((await plain).svg);
    const padded = viewBox((await m.render('t', withConfig('    diagramPadding: 20\n'))).svg);
    expect(padded[0]).toBeCloseTo(x0! - 12, 0);
    expect(padded[1]).toBeCloseTo(y0! - 12, 0);
    expect(padded[2]! - w0!).toBeCloseTo(24, 0);
    expect(padded[3]! - h0!).toBeCloseTo(24, 0);
  });

  it('padding moves the boxes apart', async () => {
    const before = leafXs((await plain).svg);
    const after = leafXs((await m.render('t', withConfig('    padding: 30\n'))).svg);
    expect(after).toHaveLength(before.length);
    expect(after).not.toEqual(before);
  });

  it('valueFormat formats the values (D409)', async () => {
    const r = await m.render('t', withConfig('    valueFormat: "$0,0"\n'));
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain('>$1,500</text>');
  });

  it('accepts the keys v12 never read, with no warning and no change (ignored)', async () => {
    const keys =
      '    useWidth: 900\n    borderWidth: 4\n    valueFontSize: 30\n    labelFontSize: 30\n';
    const set = await m.render('t', withConfig(keys));
    expect(set.warnings).toEqual([]);
    expect(set.svg).toBe((await plain).svg);
  });

  it('warns once per bad treemap key and draws with the default (D226)', async () => {
    const bad = await m.render('t', withConfig('    padding: -5\n    nodeWidth: wide\n'));
    expect(bad.warnings.map((w) => w.code)).toEqual([
      'TREEMAP_CONFIG_INVALID',
      'TREEMAP_CONFIG_INVALID',
    ]);
    expect(bad.warnings.map((w) => w.message)).toEqual([
      'treemap.nodeWidth is "wide", not a number of 0 or more; using the default 100',
      'treemap.padding is -5, not a number of 0 or more; using the default 10',
    ]);
    expect(bad.svg).toBe((await plain).svg);
    // A numeric string reads as its number, as v12 drew it.
    const text = await m.render('t', withConfig('    nodeWidth: "150"\n'));
    expect(text.warnings).toEqual([]);
    expect(text.svg).toBe((await m.render('t', withConfig('    nodeWidth: 150\n'))).svg);
  });

  it('accepts the other nested themeVariables.treemap keys v12’s styles read, which change nothing (D407)', async () => {
    const t = createMermaid();
    t.initialize({ theme: 'neutral' });
    const before = await t.render('t', TEXT);
    t.initialize({
      theme: 'neutral',
      themeVariables: {
        treemap: {
          sectionStrokeColor: '#ff0000',
          sectionStrokeWidth: '5',
          sectionFillColor: '#00ff00',
          leafStrokeColor: '#0000ff',
          leafStrokeWidth: '5',
          leafFillColor: '#ffff00',
          labelColor: '#ff00ff',
          valueColor: '#00ffff',
          labelFontSize: '30px',
          valueFontSize: '30px',
        },
      },
    });
    const after = await t.render('t', TEXT);
    expect(after.warnings).toEqual([]);
    expect(after.svg).toBe(before.svg);
  });

  it('takes a nested themeVariables.treemap title colour, and the flat name over it (D407, D540)', async () => {
    const t = createMermaid();
    t.initialize({ theme: 'dark', themeVariables: { treemap: { titleColor: '#123456' } } });
    expect((await t.render('t', TEXT)).svg).toContain('#123456');
    t.initialize({
      theme: 'redux',
      themeVariables: { treemapTitleColor: '#654321', treemap: { titleColor: '#123456' } },
    });
    const svg = (await t.render('t', TEXT)).svg;
    expect(svg).toContain('#654321');
    expect(svg).not.toContain('#123456');
  });
});
