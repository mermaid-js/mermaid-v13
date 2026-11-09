import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { usecase } from '@mermaid-js/diagram-usecase';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The usecase diagram is a first-party type (#567): `usecase-beta` goes to
// `@mermaid-js/diagram-usecase` through the generated registry, last, after `cynefin`, as in
// v12's detector order. Before the manifest it was UNSUPPORTED_DIAGRAM.
const TEXT = [
  'usecase-beta',
  '  actor User',
  '  systemBoundary Shop',
  '    Login',
  '  end',
  '  User --> Login',
  '  Login ..> : include Auth',
  '  User --> Pay("Pay for the whole order with a saved card")',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

/** The root's custom property `name`'s fallback (`--_x:var(--mermaid-y,<value>)`). */
const rootVar = (svg: string, name: string): string | undefined =>
  new RegExp(`--${name}:var\\(--mermaid-[\\w-]+,([^;)]*)\\)`).exec(svg)?.[1];
/** The first `<text>` of class `cls`. */
const textOf = (svg: string, cls: string): string | undefined =>
  new RegExp(`<text class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(svg)?.[0];
const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
const codes = (r: { warnings: readonly { code: string }[] }): string[] =>
  r.warnings.map((w) => w.code);

describe('usecase diagrams through the public API (#567)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('u1', TEXT);
    expect(result.diagramType).toBe('usecase');
    expect(result.svg).toContain('aria-roledescription="usecase"');
    expect(result.svg).toContain('class="mermaid mermaid-usecase"');
    expect(result.svg).toContain('data-ast="actor:User"');
    expect(result.svg).toContain('data-ast="usecase:Login"');
    expect(result.svg).toContain('data-ast="boundary:Shop"');
    expect(result.svg).toContain('data-ast="rel:Login-&gt;Auth"');
    expect(result.svg).toContain('«include»');
    expect(result.svg).not.toContain('foreignObject');
    expect(result.svg).not.toContain('<style');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [usecase] });
    expect((await slim.render('u2', TEXT)).svg).toBe(
      (await createMermaid().render('u2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('usecase');
  });

  it('keeps v12’s detector pattern and place, last, after cynefin', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.at(-1)).toBe('usecase');
    expect(types.indexOf('usecase')).toBe(types.indexOf('cynefin') + 1);
    const m = createMermaid();
    // Case-sensitive, ending at a blank or the end, as v12's `/^\s*usecase-beta(?:\s|$)/`.
    expect(m.detectType('  usecase-beta\n  actor A')).toBe('usecase');
    expect(m.detectType('usecase-beta')).toBe('usecase');
    for (const text of ['usecase-betax\n  actor A', 'USECASE-BETA\n  actor A', 'usecase\n'])
      expect(() => m.detectType(text), text).toThrow();
  });

  it('rejects what v12 rejects, and an undetected header as UNSUPPORTED_DIAGRAM', async () => {
    const m = createMermaid();
    for (const text of [
      'usecase-beta\n  actor A %% x\n',
      'usecase-beta\n  Login ..> Auth: include\n',
    ]) {
      const e = await rejection(m.render('u3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
    const e = await rejection(m.render('u3', 'usecase\n  actor A\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('draws in redux-color, v12’s usecase.theme default, when no theme is set', async () => {
    const plain = await createMermaid().render('u4', TEXT);
    // redux-color's actor border: `borderColorArray` slot 5.
    expect(rootVar(plain.svg, '_uar')).toBe('#a78bfa');
    const m = createMermaid();
    m.initialize({ theme: 'redux-color' });
    expect((await m.render('u4', TEXT)).svg).toBe(plain.svg);
  });

  it('lets initialize() and the text win over the default, and usecase.theme over the top level', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const classic = await m.render('u5', TEXT);
    expect(rootVar(classic.svg, '_uar')).not.toBe('#a78bfa');
    const dark = await m.render('u5', '---\nconfig:\n  theme: dark\n---\n' + TEXT);
    expect(dark.svg).not.toBe(classic.svg);
    // A usecase-scoped theme beats the top-level one in its layer, as for gitGraph.
    const scoped = await m.render('u5', '%%{init: {"usecase": {"theme": "dark"}}}%%\n' + TEXT);
    expect(scoped.svg).toBe(dark.svg);
    m.initialize({ theme: 'default', usecase: { theme: 'dark' } });
    expect((await m.render('u5', TEXT)).svg).toBe(dark.svg);
  });

  it('honours the usecase config section over its generated defaults', async () => {
    const m = createMermaid();
    const plain = (await m.render('u6', TEXT)).svg;
    const set = async (section: Record<string, unknown>) => {
      const r = await m.render(
        'u6',
        `%%{init: ${JSON.stringify({ usecase: section })}}%%\n${TEXT}`
      );
      expect(codes(r), JSON.stringify(section)).toEqual([]);
      return r.svg;
    };
    for (const section of [
      { wrappingWidth: 30 },
      { minNodeWidth: 200 },
      { nodeSpacing: 120 },
      { rankSpacing: 150 },
      { diagramPadding: 60 },
      { actorFontSize: 22 },
      { usecaseFontSize: 20 },
    ])
      expect(await set(section), JSON.stringify(section)).not.toBe(plain);
    expect(textOf(await set({ actorFontWeight: 'bold' }), 'usecase-actor-label')).toContain(
      'font-weight="700"'
    );
    expect(textOf(await set({ usecaseFontWeight: 'bold' }), 'usecase-label')).toContain(
      'font-weight="700"'
    );
    const fixed = await set({ useMaxWidth: false });
    const [, , w, h] = box(fixed)!.split(' ');
    expect(fixed).toMatch(new RegExp(`<svg [^>]*width="${w}" height="${h}"`));
    expect(fixed).not.toContain('max-width');
  });

  it('draws both font families in the theme fontFamily unless set (D132)', async () => {
    const m = createMermaid();
    const plain = (await m.render('u7', TEXT)).svg;
    // Unset, no label names a family: each inherits the root's, the theme's `fontFamily`.
    expect(textOf(plain, 'usecase-actor-label')).not.toContain('font-family');
    expect(textOf(plain, 'usecase-label')).not.toContain('font-family');
    expect(plain).not.toContain('Open Sans');
    const scoped = (
      await m.render(
        'u7',
        '%%{init: {"usecase": {"actorFontFamily": "Georgia", "usecaseFontFamily": "Courier"}}}%%\n' +
          TEXT
      )
    ).svg;
    expect(textOf(scoped, 'usecase-actor-label')).toContain('font-family="Georgia"');
    expect(textOf(scoped, 'usecase-label')).toContain('font-family="Courier"');
    // The top-level fontFamily reaches both, through the theme.
    const top = (await m.render('u7', '%%{init: {"fontFamily": "Verdana"}}%%\n' + TEXT)).svg;
    expect(top).toContain('Verdana');
  });

  it('colours by palette slot under colorScheme: rotate, and warns for an unknown scheme', async () => {
    const m = createMermaid();
    const plain = (await m.render('u8', TEXT)).svg;
    const rotate = await m.render(
      'u8',
      '%%{init: {"usecase": {"colorScheme": "rotate"}}}%%\n' + TEXT
    );
    expect(rotate.warnings).toEqual([]);
    expect(rotate.svg).not.toBe(plain);
    const unknown = await m.render('u8', '%%{init: {"usecase": {"colorScheme": "x"}}}%%\n' + TEXT);
    expect(codes(unknown)).toEqual(['USECASE_CONFIG_IGNORED']);
    expect(unknown.svg).toBe(plain);
  });

  it('lays out with layered by default; elk without the plugin warns ELK_NOT_INSTALLED (D173)', async () => {
    const m = createMermaid();
    const plain = (await m.render('u9', TEXT)).svg;
    const layered = await m.render('u9', '%%{init: {"usecase": {"layout": "layered"}}}%%\n' + TEXT);
    expect(layered.svg).toBe(plain);
    const dagre = await m.render('u9', '%%{init: {"layout": "dagre"}}%%\n' + TEXT);
    expect(dagre.svg).toBe(plain);
    const elk = await m.render('u9', '%%{init: {"usecase": {"layout": "elk"}}}%%\n' + TEXT);
    expect(codes(elk)).toEqual(['ELK_NOT_INSTALLED']);
    expect(elk.svg).toBe(plain);
  });

  it('ignores usecase.useWidth, and warns LOOK_REMOVED for usecase.look (D153)', async () => {
    const m = createMermaid();
    const base = await m.render('u10', TEXT);
    const width = await m.render('u10', '%%{init: {"usecase": {"useWidth": 99}}}%%\n' + TEXT);
    expect(width.svg).toBe(base.svg);
    expect(width.warnings).toEqual([]);
    const look = await m.render('u10', '%%{init: {"usecase": {"look": "neo"}}}%%\n' + TEXT);
    expect(look.svg).toBe(base.svg);
    expect(codes(look)).toEqual(['LOOK_REMOVED']);
  });

  it('draws the front-matter title above the diagram (D472)', async () => {
    const r = await createMermaid().render('u11', '---\ntitle: Shop use cases\n---\n' + TEXT);
    expect(textOf(r.svg, 'usecaseDiagramTitleText')).toBeDefined();
    expect(r.svg).toContain('Shop use cases');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError until T7', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('usecase', 'svg')).toBe(true);
    expect(m.supportsFormat('usecase', 'ascii')).toBe(false);
    const e = await rejection(m.render('u12', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('usecase');
  });
});
