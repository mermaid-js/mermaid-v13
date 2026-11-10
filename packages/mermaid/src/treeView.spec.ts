import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { treeView } from '@mermaid-js/diagram-treeview';
import { createMermaid, MermaidError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// Tree views are a first-party type (#577): `treeView-beta` goes to `@mermaid-js/diagram-treeview`
// through the generated registry, after eventmodeling and before radar as in v12, and no longer
// fails with UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const TEXT = [
  'treeView-beta',
  '  src/',
  '    index.ts',
  '    "util.ts" ## helpers',
  '  README.md :::highlight',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string, text = TEXT) => `---\nconfig:\n  treeView:\n${body}---\n${text}`;
const count = (svg: string, cls: string): number =>
  svg.match(new RegExp(`class="${cls}[" ]`, 'g'))?.length ?? 0;
const viewBox = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
/** The `x` of each label, in order. */
const labelXs = (svg: string): number[] =>
  [...svg.matchAll(/<text class="treeView-node-label[^"]*"[^>]* x="([^"]*)"/g)].map((m) =>
    Number(m[1])
  );

describe('tree views through the public API (#577)', () => {
  it('renders treeView-beta, which was UNSUPPORTED_DIAGRAM before', async () => {
    const m = createMermaid();
    const result = await m.render('t', TEXT);
    expect(result.diagramType).toBe('treeView');
    expect(result.svg).toContain('aria-roledescription="treeView"');
    expect(result.svg).toContain('class="mermaid mermaid-treeView"');
    // Four nodes under v12's root row `/` (D482).
    expect(count(result.svg, 'treeView-node-label')).toBe(5);
    expect(count(result.svg, 'treeView-node-label treeView-node-dir')).toBe(2);
    expect(count(result.svg, 'treeView-node-description')).toBe(1);
    expect(count(result.svg, 'treeView-highlight-bg')).toBe(1);
    expect(result.svg).toContain('>README.md</text>');
    expect(result.svg).toContain('>helpers</text>');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('keeps v12’s detector pattern and place, after eventmodeling and before radar', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('treeView')).toBe(types.indexOf('eventmodeling') + 1);
    expect(types.indexOf('radar')).toBe(types.indexOf('treeView') + 1);
    const m = createMermaid();
    expect(m.detectType('  treeView-beta\na')).toBe('treeView');
    expect(() => m.detectType('treeView\na')).toThrow(MermaidError);
  });

  it('rejects text v12 rejects with SYNTAX, at the line', async () => {
    const e = await rejection(createMermaid().render('t', 'treeView-beta\n  a\n  "b\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBe(3);
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('treeView');
  });

  it('renders through mermaid/slim with the treeView plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [treeView] });
    expect((await slim.render('t', TEXT)).svg).toBe((await createMermaid().render('t', TEXT)).svg);
  });

  it('draws text from the ./ascii entry (#578, D488)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('treeView', 'svg')).toBe(true);
    expect(m.supportsFormat('treeView', 'ascii')).toBe(true);
    const result = await m.render('t', TEXT, { format: 'ascii' });
    expect(result).toMatchObject({ format: 'ascii', diagramType: 'treeView' });
    expect(result.text).toContain('├── index.ts');
    expect(result.text).toContain('▶');
    expect(result.warnings).toEqual([]);
    const plain = m.renderSync(TEXT, { format: 'ascii', config: { ascii: { charset: 'ascii' } } });
    expect(plain.text).toContain('|-- index.ts');
  });
});

describe('the treeView config section through render() (#577)', () => {
  const m = createMermaid();
  const plain = m.render('t', TEXT);

  it('useMaxWidth: on by default, false draws at its own width', async () => {
    expect((await plain).svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('t', withConfig('    useMaxWidth: false\n'));
    expect(fixed.warnings).toEqual([]);
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d/);
  });

  it('rowIndent and paddingX indent each level by their sum', async () => {
    const [, src, idx] = labelXs((await plain).svg);
    expect(idx! - src!).toBe(15);
    const wide = labelXs((await m.render('t', withConfig('    rowIndent: 30\n'))).svg);
    expect(wide[2]! - wide[1]!).toBe(35);
  });

  it('paddingY makes each row taller', async () => {
    const h0 = viewBox((await plain).svg)[3]!;
    const tall = viewBox((await m.render('t', withConfig('    paddingY: 10\n'))).svg)[3]!;
    expect(tall).toBeGreaterThan(h0 + 30);
  });

  it('lineThickness sets the connectors’ stroke width', async () => {
    const thick = await m.render('t', withConfig('    lineThickness: 3\n'));
    expect(thick.warnings).toEqual([]);
    expect((await plain).svg).not.toMatch(/class="treeView-node-line"[^>]* stroke-width="3"/);
    expect(thick.svg).toMatch(/class="treeView-node-line"[^>]* stroke-width="3"/);
  });

  it('showIcons draws the built-in file and folder icons', async () => {
    expect(count((await plain).svg, 'treeView-node-icon')).toBe(0);
    const icons = await m.render('t', withConfig('    showIcons: true\n'));
    expect(icons.warnings).toEqual([]);
    expect(count(icons.svg, 'treeView-node-icon')).toBe(5);
  });

  it('filenameIcons and extensionIcons pick an icon, `none` hides it', async () => {
    const body =
      '    showIcons: true\n    filenameIcons:\n      README.md: none\n' +
      '    extensionIcons:\n      .ts: none\n';
    const r = await m.render('t', withConfig(body));
    expect(r.warnings).toEqual([]);
    // The root row and `src/` keep their folders.
    expect(count(r.svg, 'treeView-node-icon')).toBe(2);
  });

  it('defaultIconPack names the pack an unprefixed icon() comes from', async () => {
    const text = 'treeView-beta\n  a icon(logo)\n';
    const r = await m.render('t', withConfig('    defaultIconPack: pk\n', text));
    expect(r.warnings.map((w) => w.code)).toEqual(['ICON_NOT_RENDERED']);
    expect(r.warnings[0]!.message).toContain('pk:logo');
  });

  it('warns once per bad treeView key and draws with the default (D226)', async () => {
    const bad = await m.render(
      't',
      withConfig(
        '    rowIndent: -5\n    paddingX: wide\n    defaultIconPack: 3\n    extensionIcons: none\n'
      )
    );
    expect(bad.warnings.map((w) => w.code)).toEqual([
      'TREEVIEW_CONFIG_INVALID',
      'TREEVIEW_CONFIG_INVALID',
      'TREEVIEW_CONFIG_INVALID',
      'TREEVIEW_CONFIG_INVALID',
    ]);
    expect(bad.warnings.map((w) => w.message).sort()).toEqual([
      'treeView.defaultIconPack is 3, not a string; using the default ""',
      'treeView.extensionIcons is "none", not a map of names to icons; using the default {}',
      'treeView.paddingX is "wide", not a number of 0 or more; using the default 5',
      'treeView.rowIndent is -5, not a number of 0 or more; using the default 10',
    ]);
    expect(bad.svg).toBe((await plain).svg);
    // A numeric string reads as its number (v12 concatenated it: `'30' + 5` px).
    const text = await m.render('t', withConfig('    rowIndent: "30"\n'));
    expect(text.warnings).toEqual([]);
    expect(text.svg).toBe((await m.render('t', withConfig('    rowIndent: 30\n'))).svg);
  });

  it('takes a nested themeVariables.treeView colour, and the flat name over it (D335, D540)', async () => {
    const t = createMermaid();
    t.initialize({ theme: 'dark', themeVariables: { treeView: { lineColor: '#123456' } } });
    expect((await t.render('t', TEXT)).svg).toContain('#123456');
    t.initialize({
      theme: 'redux',
      themeVariables: { treeViewLineColor: '#654321', treeView: { lineColor: '#123456' } },
    });
    const svg = (await t.render('t', TEXT)).svg;
    expect(svg).toContain('#654321');
    expect(svg).not.toContain('#123456');
  });
});
