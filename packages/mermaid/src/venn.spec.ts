import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { venn } from '@mermaid-js/diagram-venn';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The venn diagram is a first-party type (#501): `venn-beta` goes to `@mermaid-js/diagram-venn`
// through the generated registry, after the railroad rows and before `wardley`, as in v12's
// detector order.
const TEXT = [
  'venn-beta',
  '  title Skills',
  '  set A["Frontend"]',
  '    text "React"',
  '  set B["Backend"]',
  '  union A, B["Both"]',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
/** The fill of the first set's circle path. */
const firstFill = (svg: string): string | undefined =>
  /<g class="venn-area venn-circle venn-set-0"[^>]*><path [^>]*fill="([^"]*)"/.exec(svg)?.[1];
const title = (svg: string): string | undefined =>
  /<text class="venn-title"[^>]*>([\s\S]*?)<\/text>/.exec(svg)?.[1]?.replace(/<[^>]+>/g, '');

describe('venn diagrams through the public API (#501)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('v1', TEXT);
    expect(result.diagramType).toBe('venn');
    expect(result.svg).toContain('aria-roledescription="venn"');
    expect(result.svg).toContain('class="mermaid mermaid-venn"');
    expect(result.svg.match(/<g class="venn-area venn-circle venn-set-\d"/g)).toHaveLength(2);
    expect(result.svg.match(/<g class="venn-area venn-intersection"/g)).toHaveLength(1);
    expect(result.svg.match(/<text class="venn-text-node"/g)).toHaveLength(1);
    expect(title(result.svg)).toBe('Skills');
    expect(result.svg).not.toContain('foreignObject');
    expect(result.svg).not.toContain('<style');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim with the plugin passed in, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [venn] });
    expect((await slim.render('v2', TEXT)).svg).toBe(
      (await createMermaid().render('v2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('venn');
  });

  it('keeps v12’s detector pattern and place, after the railroad rows and before wardley', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('venn')).toBe(types.indexOf('railroadPeg') + 1);
    expect(types.indexOf('wardley')).toBe(types.indexOf('venn') + 1);
    const m = createMermaid();
    // Case-sensitive, with no word boundary, as v12's `/^\s*venn-beta/`.
    expect(m.detectType('  venn-beta\n  set A')).toBe('venn');
    expect(m.detectType('venn-betax\n  set A')).toBe('venn');
    expect(() => m.detectType('VENN-BETA\n  set A')).toThrow();
    expect(() => m.detectType('venn\n  set A')).toThrow();
  });

  it('rejects a header the detector takes but the grammar does not, and what v12 rejects', async () => {
    const m = createMermaid();
    for (const text of ['venn-betax\n  set A\n', 'venn-beta\n  set A\n  union A\n']) {
      const e = await rejection(m.render('v3', text));
      expect(e, text).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code, text).toBe('SYNTAX');
    }
    const e = await rejection(m.render('v3', 'VENN-BETA\n  set A\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('draws in redux-color, v12’s venn.theme default, when no theme is set', async () => {
    const plain = await createMermaid().render('v4', TEXT);
    // redux-color's palette: the first set is `borderColorArray[0]`.
    expect(firstFill(plain.svg)).toBe('#e879f9');
    const m = createMermaid();
    m.initialize({ theme: 'redux-color' });
    expect((await m.render('v4', TEXT)).svg).toBe(plain.svg);
  });

  it('lets a theme from initialize() or the diagram text win over the venn.theme default', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const classic = await m.render('v5', TEXT);
    expect(firstFill(classic.svg)).not.toBe('#e879f9');
    const fmDefault = await createMermaid().render(
      'v5',
      '---\nconfig:\n  theme: default\n---\n' + TEXT
    );
    expect(fmDefault.svg).toBe(classic.svg);
    // The text beats initialize(), and a venn-scoped theme beats the top level in its layer.
    const dark = await m.render('v5', '---\nconfig:\n  theme: dark\n---\n' + TEXT);
    expect(dark.svg).not.toBe(classic.svg);
    const scoped = await m.render('v5', '%%{init: {"venn": {"theme": "dark"}}}%%\n' + TEXT);
    expect(scoped.svg).toBe(dark.svg);
    m.initialize({ theme: 'default', venn: { theme: 'dark' } });
    expect((await m.render('v5', TEXT)).svg).toBe(dark.svg);
  });

  it('honours the venn config section over its generated defaults', async () => {
    const m = createMermaid();
    const body = 'venn-beta\n  set A\n  set B\n  union A, B\n';
    const plain = await m.render('v6', body);
    expect(box(plain.svg)).toBe('0 0 800 450');
    const sized = '%%{init: {"venn": {"width": 400, "height": 300}}}%%\n' + body;
    expect(box((await m.render('v6', sized)).svg)).toBe('0 0 400 300');
    // One solve at 15 by default (D412); an author's padding moves the circles.
    const padded = '%%{init: {"venn": {"padding": 60}}}%%\n' + body;
    expect((await m.render('v6', padded)).svg).not.toBe(plain.svg);
    // The debug shapes are each text area's inner circle and cells.
    const debug = '%%{init: {"venn": {"useDebugLayout": true}}}%%\n' + TEXT;
    expect((await m.render('v6', TEXT)).svg).not.toContain('stroke-dasharray');
    expect((await m.render('v6', debug)).svg).toContain('stroke-dasharray');
    const fixed = '---\nconfig:\n  venn:\n    useMaxWidth: false\n---\n' + body;
    const svg = (await m.render('v6', fixed)).svg;
    expect(svg).toMatch(/<svg [^>]*width="800" height="450"/);
    expect(svg).not.toContain('max-width');
  });

  it('ignores venn.useWidth, and warns LOOK_REMOVED for venn.look (D153)', async () => {
    const m = createMermaid();
    const base = await m.render('v7', TEXT);
    const width = await m.render('v7', '%%{init: {"venn": {"useWidth": 99}}}%%\n' + TEXT);
    expect(width.svg).toBe(base.svg);
    expect(width.warnings).toEqual([]);
    const look = await m.render('v7', '%%{init: {"venn": {"look": "neo"}}}%%\n' + TEXT);
    expect(look.svg).toBe(base.svg);
    expect(look.warnings.map((w) => w.code)).toEqual(['LOOK_REMOVED']);
  });

  it('draws a front-matter title, and the title statement over it (D218), quotes stripped (D416)', async () => {
    const m = createMermaid();
    const fm = '---\ntitle: From front matter\n---\nvenn-beta\n  set A\n';
    expect(title((await m.render('v8', fm)).svg)).toBe('From front matter');
    const both = '---\ntitle: From front matter\n---\nvenn-beta\n  title "Team overlap"\n  set A\n';
    expect(title((await m.render('v8', both)).svg)).toBe('Team overlap');
  });

  it('draws invalid input with one warning per kind (D417)', async () => {
    const m = createMermaid();
    const empty = await m.render('v9', 'venn-beta\n  title Only\n');
    expect(empty.warnings.map((w) => w.code)).toEqual(['VENN_EMPTY']);
    expect(title(empty.svg)).toBe('Only');
    const sizes = await m.render('v9', 'venn-beta\n  set A: 0\n  set B: -1\n  set C: 0\n  set D\n');
    expect(sizes.warnings.map((w) => w.code).sort()).toEqual([
      'VENN_INVALID_SIZE',
      'VENN_ZERO_SET',
    ]);
    expect(sizes.svg).not.toContain('NaN');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('venn', 'svg')).toBe(true);
    expect(m.supportsFormat('venn', 'ascii')).toBe(false);
    const e = await rejection(m.render('v10', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('venn');
  });
});
