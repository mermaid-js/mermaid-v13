import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { radar } from '@mermaid-js/diagram-radar';
import { wardley } from '@mermaid-js/diagram-wardley';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// Wardley maps are a first-party type (#497): `wardley-beta` goes to
// `@mermaid-js/diagram-wardley` through the generated registry, after venn and before cynefin as
// in v12, and no longer fails with UNSUPPORTED_DIAGRAM (R-COMPAT-7). Its config section keeps
// v12's name, `wardley-beta`, honoured from every source (D421).
const TEXT = [
  'wardley-beta',
  '  title Tea Shop',
  '  anchor Business [0.95, 0.63]',
  '  component "Cup of Tea" [0.79, 0.61] label [19, -4]',
  '  component Kettle [0.43, 0.35]',
  '  Business -> "Cup of Tea"',
  '  "Cup of Tea" -> Kettle',
  '  evolve Kettle 0.62',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string, text = TEXT) =>
  `---\nconfig:\n  wardley-beta:\n${body}---\n${text}`;
const viewBox = (svg: string) => /viewBox="([^"]*)"/.exec(svg)?.[1];
const count = (svg: string, cls: string): number =>
  svg.match(new RegExp(`class="${cls}[" ]`, 'g'))?.length ?? 0;

describe('Wardley maps through the public API (#497)', () => {
  it('renders wardley-beta, which was UNSUPPORTED_DIAGRAM before', async () => {
    const result = await createMermaid().render('w', TEXT);
    expect(result.diagramType).toBe('wardley');
    expect(result.svg).toContain('aria-roledescription="wardley"');
    expect(result.svg).toContain('class="mermaid mermaid-wardley"');
    expect(count(result.svg, 'wardley-node')).toBe(3);
    expect(result.svg).toContain('>Cup of Tea</text>');
    expect(result.svg).toContain('>Tea Shop</text>');
    expect(count(result.svg, 'wardley-trend')).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.width).toBe(900);
    expect(viewBox(result.svg)).toBe('0 0 900 600');
    assertInert(result.svg);
  });

  it('keeps v12’s detector pattern and place, after venn and before cynefin', async () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('wardley')).toBe(types.indexOf('venn') + 1);
    expect(types.indexOf('cynefin')).toBe(types.indexOf('wardley') + 1);
    const m = createMermaid();
    expect(m.detectType('  wardley-beta\ncomponent A [0.5, 0.5]')).toBe('wardley');
    // v12's detector is case-insensitive and its grammar is not: detected, then a syntax error.
    expect(m.detectType('Wardley-Beta\n')).toBe('wardley');
    const upper = await rejection(m.render('w', 'Wardley-Beta\ncomponent A [0.5, 0.5]\n'));
    expect((upper as MermaidError).code).toBe('SYNTAX');
    const bare = await rejection(m.render('w', 'wardley\ncomponent A [0.5, 0.5]\n'));
    expect((bare as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('reports what v12 rejects as a positioned SYNTAX MermaidError', async () => {
    const e = await rejection(createMermaid().render('w', 'wardley-beta\ncomponent A [0.5 0.5]\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBe(2);
  });

  it('draws a front-matter title, and an in-text title wins (D218)', async () => {
    const m = createMermaid();
    const body = 'wardley-beta\ncomponent A [0.5, 0.5]\n';
    const fm = await m.render('w', `---\ntitle: From front matter\n---\n${body}`);
    expect(fm.svg).toContain('>From front matter</text>');
    const both = await m.render('w', `---\ntitle: Front\n---\n${TEXT}`);
    expect(both.svg).toContain('>Tea Shop</text>');
    expect(both.svg).not.toContain('>Front</text>');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('wardley');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('wardley', 'svg')).toBe(true);
    expect(m.supportsFormat('wardley', 'ascii')).toBe(false);
    const e = await rejection(m.render('w', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('wardley');
  });

  it('renders through mermaid/slim with the wardley plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [wardley] });
    expect((await slim.render('w', TEXT)).svg).toBe((await createMermaid().render('w', TEXT)).svg);
  });
});

describe('the wardley-beta config section through render() (#497, D421, D424)', () => {
  const m = createMermaid();
  const plain = m.render('w', TEXT);

  it('reads each key from front matter (D421)', async () => {
    const keys = [
      '    width: 1200\n',
      '    height: 800\n',
      '    padding: 20\n',
      '    nodeRadius: 10\n',
      '    nodeLabelOffset: 20\n',
      '    axisFontSize: 18\n',
      '    labelFontSize: 16\n',
      '    showGrid: true\n',
      '    useMaxWidth: false\n',
    ];
    for (const body of keys) {
      const r = await m.render('w', withConfig(body));
      expect(r.warnings, body).toEqual([]);
      expect(r.svg, body).not.toBe((await plain).svg);
    }
    expect((await plain).svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('w', withConfig('    useMaxWidth: false\n'));
    expect(fixed.svg).toMatch(/<svg[^>]* width="900"/);
    expect(viewBox((await m.render('w', withConfig('    width: 1200\n'))).svg)).toBe(
      '0 0 1200 600'
    );
    expect(
      count((await m.render('w', withConfig('    showGrid: true\n'))).svg, 'wardley-grid')
    ).toBe(1);
  });

  it('reads the section from %%{init}, its config key and initialize() alike (D421)', async () => {
    const want = (await m.render('w', withConfig('    width: 1200\n    showGrid: true\n'))).svg;
    const init = `%%{init: {"wardley-beta": {"width": 1200, "showGrid": true}}}%%\n${TEXT}`;
    expect((await m.render('w', init)).svg).toBe(want);
    const key = `%%{init: {"config": {"width": 1200, "showGrid": true}}}%%\n${TEXT}`;
    expect((await m.render('w', key)).svg).toBe(want);
    const site = createMermaid();
    site.initialize({ 'wardley-beta': { width: 1200, showGrid: true } });
    expect((await site.render('w', TEXT)).svg).toBe(want);
    // The map's own `size` wins over the section's canvas, as in v12.
    const sized = await m.render(
      'w',
      withConfig('    width: 1200\n', `${TEXT}  size [500, 400]\n`)
    );
    expect(viewBox(sized.svg)).toBe('0 0 500 400');
  });

  it('accepts useWidth without a warning and draws nothing different (ignored)', async () => {
    const set = await m.render('w', withConfig('    useWidth: 900\n'));
    expect(set.warnings).toEqual([]);
    expect(set.svg).toBe((await plain).svg);
  });

  it('warns once per bad key and draws with the default (D424)', async () => {
    const bad = await m.render('w', withConfig('    width: wide\n    nodeRadius: 0\n'));
    expect(bad.warnings.map((w) => [w.code, w.path])).toEqual([
      ['WARDLEY_CONFIG_INVALID', 'wardley-beta.width'],
      ['WARDLEY_CONFIG_INVALID', 'wardley-beta.nodeRadius'],
    ]);
    expect(bad.svg).toBe((await plain).svg);
    // A numeric string reads as its number.
    const text = await m.render('w', withConfig('    width: "1200"\n'));
    expect(text.warnings).toEqual([]);
    expect(viewBox(text.svg)).toBe('0 0 1200 600');
  });

  it('falls back from a size of 0 and a padding that leaves no chart, never drawing NaN (D424)', async () => {
    const zero = await m.render('w', `${TEXT}  size [0, 0]\n`);
    expect(zero.warnings.map((w) => w.code)).toEqual(['WARDLEY_CONFIG_INVALID']);
    expect(viewBox(zero.svg)).toBe('0 0 900 600');
    const wide = await m.render('w', withConfig('    padding: 300\n'));
    expect(wide.warnings.map((w) => [w.code, w.path])).toEqual([
      ['WARDLEY_CONFIG_INVALID', 'wardley-beta.padding'],
    ]);
    expect(wide.svg).toBe((await plain).svg);
    for (const svg of [zero.svg, wide.svg]) expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('clamps stage boundaries to [0, 1] with one warning (D424)', async () => {
    const r = await m.render('w', `${TEXT}  evolution A@0.5 -> B@40.0\n`);
    expect(r.warnings.map((w) => w.code)).toEqual(['WARDLEY_STAGE_CLAMPED']);
    expect(r.svg).not.toMatch(/NaN|Infinity/);
  });
});

describe('wardley theme variables through render() (#497, D335, D540)', () => {
  it('takes a nested themeVariables.wardley colour, and the flat name over it', async () => {
    const t = createMermaid();
    t.initialize({
      theme: 'redux',
      output: { cssVariables: false },
      themeVariables: { wardley: { axisColor: '#123456', linkStroke: '#abcdef' } },
    });
    const nested = (await t.render('w', TEXT)).svg;
    expect(nested).toContain('#123456');
    expect(nested).toContain('#abcdef');
    t.initialize({
      theme: 'redux',
      output: { cssVariables: false },
      themeVariables: { wardleyAxisColor: '#654321', wardley: { axisColor: '#123456' } },
    });
    const flat = (await t.render('w', TEXT)).svg;
    expect(flat).toContain('#654321');
    expect(flat).not.toContain('#123456');
  });
});

describe('a plugin without configSection resolves its config by id, unchanged (#497)', () => {
  it('puts radar’s defaults and an init `config` key under `radar`', async () => {
    expect((radar as { configSection?: string }).configSection).toBeUndefined();
    let seen: Readonly<Record<string, unknown>> | undefined;
    const spy = {
      ...radar,
      layout: (...args: Parameters<typeof radar.layout>) => {
        seen = args[1].config;
        return radar.layout(...args);
      },
    };
    const m = createMermaid();
    await m.registerExternalDiagrams([spy], { lazyLoad: false, replace: true });
    await m.render('r', '%%{init: {"config": {"width": 800}}}%%\nradar-beta\n  axis A, B, C\n');
    expect(seen?.radar).toMatchObject({ ...radar.configDefaults, width: 800 });
    expect(seen?.['wardley-beta']).toBeUndefined();
  });
});
