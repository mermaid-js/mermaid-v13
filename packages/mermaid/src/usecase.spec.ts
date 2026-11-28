import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { usecase } from '@mermaid-js/diagram-usecase';
import { createMermaid, MermaidError } from './index.ts';
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
    const size = (svg: string): number[] => box(svg)!.split(' ').slice(2).map(Number);
    const [width, height] = size(plain);
    // The flow runs LR in three ranks (User; Login over Pay; Auth), the defaults 120/50/50/20.
    // Each oval is its block plus 20 a side: at 200 the two ranks of use cases are 80 wider each.
    expect(size(await set({ minNodeWidth: 200 }))).toEqual([width! + 160, height]);
    // Two rank gaps 100 longer each; one gap between Login and Pay 70 longer.
    expect(size(await set({ rankSpacing: 150 }))).toEqual([width! + 200, height]);
    expect(size(await set({ nodeSpacing: 120 }))).toEqual([width, height! + 70]);
    expect(size(await set({ diagramPadding: 60 }))).toEqual([width! + 80, height! + 80]);
    // Pay's label in lines of at most 30px: one word a line, a word wider than that kept whole
    // as v12's HTML label kept it (#649).
    const lines = (svg: string): string[] =>
      [
        ...(/data-id="Pay"[^>]*>(.*?)<\/text>/.exec(svg)?.[1] ?? '').matchAll(
          /<tspan[^>]*>([^<]*)</g
        ),
      ].map((t) => t[1]!);
    expect(lines(plain)).toEqual(['Pay for the whole', 'order with a saved', 'card']);
    expect(lines(await set({ wrappingWidth: 30 })).slice(0, 4)).toEqual([
      'Pay',
      'for',
      'the',
      'whole',
    ]);
    expect(textOf(await set({ actorFontSize: 22 }), 'usecase-actor-label')).toContain(
      'font-size="22"'
    );
    expect(textOf(await set({ usecaseFontSize: 20 }), 'usecase-label')).toContain('font-size="20"');
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
    // redux-color: by role every oval takes the usecase pair; rotated, each its own slot (the
    // actor slot 0, the use cases after it).
    const ovals = (svg: string): string[] =>
      [...svg.matchAll(/<ellipse [^>]*fill="([^"]+)" stroke="([^"]+)"/g)].map(
        (o) => `${o[1]} ${o[2]}`
      );
    expect(ovals(plain)).toEqual(Array(3).fill('var(--_ucb) var(--_ucr)'));
    expect(ovals(rotate.svg)).toEqual(['#f0fdfa #2dd4bf', '#fff7ed #fb923c', '#ecfeff #22d3ee']);
    expect(rotate.svg).toContain('class="usecase-actor-stick"');
    expect(/class="usecase-actor-stick"[^>]*fill="#fdf4ff" stroke="#e879f9"/.test(rotate.svg)).toBe(
      true
    );
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

  it('draws as text (#569, D478): figures, ( label ), frames, «include», in both charsets', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('usecase', 'svg')).toBe(true);
    expect(m.supportsFormat('usecase', 'ascii')).toBe(true);
    const result = await m.render('u12', TEXT, { format: 'ascii' });
    expect(result).toMatchObject({
      format: 'ascii',
      diagramType: 'usecase',
      columns: 58,
      rows: 13,
    });
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(
      [
        '             ┌───── Shop ────┐',
        '             │               │',
        '             │   ╭───────╮   │                    ╭──────╮',
        '      ┌──────┼──►( Login )┄┄┄┼┄┄┄┄┄┄┄ «include» ┄►( Auth )',
        '  O   │      │   ╰───────╯   │                    ╰──────╯',
        ' /|\\──┘      │               │',
        ' / \\         └───────────────┘',
        'User──┐',
        '      │',
        '      │ ╭─────────────────────────╮',
        '      └►( Pay for the whole order )',
        '        (    with a saved card    )',
        '        ╰─────────────────────────╯',
      ].join('\n')
    );
    const ascii = m.renderSync(TEXT, { format: 'ascii', config: { ascii: { charset: 'ascii' } } });
    expect(ascii.text).toContain('( Login )...+....... <<include>> .>( Auth )');
    expect(ascii.text).not.toMatch(/[\u2500-\u25ff]/u);
    // A text render leaves the instance's SVG render as a fresh one draws it.
    expect((await m.render('u12', TEXT)).svg).toBe((await createMermaid().render('u12', TEXT)).svg);
  });

  it('never crops: wider than ascii.maxWidth turns LR to TB, then warns ASCII_TOO_WIDE (R-ASCII-8)', async () => {
    const m = createMermaid();
    const wide = await m.render('u13', TEXT, { format: 'ascii', ascii: { maxWidth: 20 } });
    expect(wide.columns).toBe(41);
    expect(wide.text.split('\n')[0]).toBe('                O');
    expect(codes(wide)).toEqual(['ASCII_TOO_WIDE']);
    const fits = await m.render('u13', TEXT, { format: 'ascii', ascii: { maxWidth: 80 } });
    expect(fits.columns).toBe(58);
    expect(fits.warnings).toEqual([]);
  });

  it('warns for what text output cannot honour: another engine, usecase fonts and options (pitfall 22)', async () => {
    const text =
      '---\nconfig:\n  layout: elk\n  usecase:\n    actorFontSize: 20\n    useMaxWidth: false\n---\n' +
      TEXT;
    const m = createMermaid();
    const r = await m.render('u14', text, { format: 'ascii' });
    expect(r.warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
      ['ASCII_DROPPED', 'layout'],
      ['ASCII_DROPPED', 'config'],
    ]);
    expect(r.warnings[1]!.message).toContain('actorFontSize, useMaxWidth');
    expect(r.text).toBe((await m.render('u14', TEXT, { format: 'ascii' })).text);
  });
});

describe('usecase under a classic theme with a primaryColor override (#773)', () => {
  const text = readFileSync(
    new URL(
      '../../../e2e/diagrams/usecase/baseline/themes/default-primary-override.mmd',
      import.meta.url
    ),
    'utf8'
  );

  it("fills the ellipse and the actor head with default's mainBkg #ececff, as v12", async () => {
    const m = createMermaid();
    m.initialize({ output: { cssVariables: false } });
    const { svg } = await m.render('u773', text);
    expect(/<ellipse [^>]*fill="([^"]*)"/.exec(svg)?.[1]).toBe('#ececff');
    expect(/class="usecase-actor-stick"[^>]*fill="([^"]*)"/.exec(svg)?.[1]).toBe('#ececff');
    expect(svg).not.toContain('#ffcc00');
  });

  it('reads mainBkg, so --mermaid-mainBkg repaints them and --mermaid-primaryColor does not (R-THEME-3)', async () => {
    const { svg } = await createMermaid().render('u773', text);
    expect(rootVar(svg, '_mb')).toBe('#ececff');
    expect(svg).not.toContain('--mermaid-primaryColor');
  });
});

describe('usecase labels: markdown strings, markdownAlwaysOn and the warning (#1368, #1398)', () => {
  const fixture = (name: string): string =>
    readFileSync(
      new URL(`../../../e2e/diagrams/usecase/pr-check/${name}.mmd`, import.meta.url),
      'utf8'
    );
  // Every label kind with a plain `**bold** _ital_`: boundary, actor, round and square use case,
  // association edge label, note.
  const KINDS = [
    'usecase-beta',
    '  systemBoundary B["boundary **bold** _ital_"]',
    '    actor A("actor **bold** _ital_")',
    '    U("usecase **bold** _ital_")',
    '    S[square **bold** _ital_]',
    '  end',
    '  A -- "edge **bold** _ital_" --> U',
    '  A --> S',
    '  note for U "note **bold** _ital_"',
    '',
  ].join('\n');
  const count = (svg: string, re: RegExp): number => [...svg.matchAll(re)].length;
  const BOLD = /font-weight="bold"[^>]*>bold</g;
  const ITALIC = /font-style="italic"[^>]*>ital</g;

  it('draws plain markers as written and warns once; a markdown string does not warn', async () => {
    const m = createMermaid();
    const r = await m.render('ul1', KINDS);
    expect(count(r.svg, BOLD)).toBe(0);
    // Drawn as written (in the text, not counting the accessible names).
    expect(count(r.svg, />[^<]*\*\*bold\*\*[^<]*</g)).toBe(6);
    expect(codes(r).filter((c) => c === MARKDOWN_NOT_READ.code)).toHaveLength(1);
    const quoted = KINDS.replace(/"([a-z]+ \*\*bold\*\* _ital_)"/g, '"`$1`"').replace(
      'S[square **bold** _ital_]',
      'S["`square **bold** _ital_`"]'
    );
    const q = await m.render('ul2', quoted);
    expect(count(q.svg, BOLD)).toBe(6);
    expect(codes(q)).not.toContain(MARKDOWN_NOT_READ.code);
  });

  it('draws every label kind as markdown with markdownAlwaysOn, global or in the usecase section', async () => {
    for (const config of [{ markdownAlwaysOn: true }, { usecase: { markdownAlwaysOn: true } }]) {
      const m = createMermaid();
      m.initialize(config);
      const r = await m.render('ul3', KINDS);
      const name = JSON.stringify(config);
      expect(count(r.svg, BOLD), name).toBe(6);
      expect(count(r.svg, ITALIC), name).toBe(6);
      expect(r.svg, name).not.toContain('**');
      expect(codes(r), name).toEqual([]);
      // The text output follows the drawing: the markers are gone there too.
      const t = await m.render('ul4', KINDS, { format: 'ascii' });
      expect(t.text, name).not.toMatch(/\*\*|_ital_/);
      expect(t.text, name).toContain('note bold ital');
    }
  });

  it('draws the compatibility twin of label-syntax.mmd with markdown in the plain rows', async () => {
    const m = createMermaid();
    const plain = await m.render('ul5', fixture('label-syntax'));
    const always = await m.render('ul6', fixture('label-syntax-compat'));
    expect(always.svg).not.toBe(plain.svg);
    expect(count(always.svg, BOLD)).toBeGreaterThan(count(plain.svg, BOLD));
    expect(codes(plain)).toContain(MARKDOWN_NOT_READ.code);
    expect(codes(always)).not.toContain(MARKDOWN_NOT_READ.code);
  });
});
