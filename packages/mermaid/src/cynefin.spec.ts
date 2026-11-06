import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { cynefin } from '@mermaid-js/diagram-cynefin';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The cynefin diagram is a first-party type (#469): `cynefin-beta` goes to
// `@mermaid-js/diagram-cynefin` through the generated registry, after `wardley` as in v12's
// detector order.
const TEXT = [
  'cynefin-beta',
  '  title Response',
  '  complex',
  '    "Probe"',
  '  clear',
  '    "Categorise"',
  '  complex --> clear : "stabilise"',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

/** The text of the one `text.cynefinTitle`, or undefined when none is drawn. */
const title = (svg: string): string | undefined => {
  const m = /<text\b[^>]*class="cynefinTitle"[^>]*>([\s\S]*?)<\/text>/.exec(svg);
  return m?.[1]?.replace(/<[^>]+>/g, '');
};

describe('cynefin diagrams through the public API (#469)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const m = createMermaid();
    const result = await m.render('c1', TEXT);
    expect(result.diagramType).toBe('cynefin');
    expect(result.svg).toContain('aria-roledescription="cynefin"');
    expect(result.svg).toContain('class="mermaid mermaid-cynefin"');
    expect(result.svg.match(/class="cynefinDomain"/g)).toHaveLength(4);
    expect(result.svg.match(/class="cynefinArrowLine"/g)).toHaveLength(1);
    expect(title(result.svg)).toBe('Response');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim with the plugin passed in, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [cynefin] });
    expect((await slim.render('c6', TEXT)).svg).toBe(
      (await createMermaid().render('c6', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('cynefin');
  });

  it('keeps v12’s detector pattern and place, after wardley', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('cynefin')).toBe(types.indexOf('wardley') + 1);
    const m = createMermaid();
    expect(m.detectType('  cynefin-beta\n complex "a"')).toBe('cynefin');
    expect(m.detectType('cynefin-beta: x')).toBe('cynefin');
    expect(() => m.detectType('cynefin-betax\n')).toThrow();
  });

  it('detects a header with a comment right after it, as v12’s detectType does', async () => {
    // v12 cut each `%%` comment before its detectors ran, so `cynefin-beta%% c` matched.
    const m = createMermaid();
    const text = 'cynefin-beta%% c\ncomplex\n  "a"\n';
    expect(m.detectType(text)).toBe('cynefin');
    expect((await m.render('c7', text)).diagramType).toBe('cynefin');
    expect(() => m.detectType('cynefin-betax%% c\n')).toThrow();
  });

  it('draws a front-matter title where v12 draws the title statement (D218)', async () => {
    const m = createMermaid();
    const fm = '---\ntitle: From front matter\n---\ncynefin-beta\n  complex\n    "a"\n';
    expect(title((await m.render('c2', fm)).svg)).toBe('From front matter');
    // The title statement wins over the front matter, as in v12.
    const both = '---\ntitle: From front matter\n---\ncynefin-beta\n  title Statement\n';
    expect(title((await m.render('c2', both)).svg)).toBe('Statement');
  });

  it('honours the cynefin config section over its generated defaults', async () => {
    const m = createMermaid();
    const box = (svg: string): string | undefined => /viewBox="([^"]*)"/.exec(svg)?.[1];
    // v12's canvas: width + 2·padding by height + 2·padding.
    expect(box((await m.render('c3', 'cynefin-beta\n')).svg)).toBe('0 0 880 680');
    const sized = '%%{init: {"cynefin": {"width": 400, "height": 300, "padding": 10}}}%%\n';
    expect(box((await m.render('c3', sized + 'cynefin-beta\n')).svg)).toBe('0 0 420 320');
    const plain = '%%{init: {"cynefin": {"showDomainDescriptions": false}}}%%\ncynefin-beta\n';
    expect((await m.render('c3', plain)).svg).not.toContain('cynefinSubtitle');
  });

  it('takes a nested themeVariables.cynefin colour, and the flat name over it (D335, D540)', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'dark', themeVariables: { cynefin: { complexBg: '#123456' } } });
    expect((await m.render('c4', TEXT)).svg).toContain('#123456');
    m.initialize({
      theme: 'redux',
      themeVariables: { cynefinComplexBg: '#654321', cynefin: { complexBg: '#123456' } },
    });
    const svg = (await m.render('c4', TEXT)).svg;
    expect(svg).toContain('#654321');
    expect(svg).not.toContain('#123456');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('cynefin', 'svg')).toBe(true);
    expect(m.supportsFormat('cynefin', 'ascii')).toBe(false);
    const e = await rejection(m.render('c5', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('cynefin');
  });
});
