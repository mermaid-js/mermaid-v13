import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { ishikawa } from '@mermaid-js/diagram-ishikawa';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The ishikawa diagram is a first-party type (#585): `ishikawa` and `ishikawa-beta` go to
// `@mermaid-js/diagram-ishikawa` through the generated registry, after `radar` and before
// `treemap`, as in v12's detector order.
const TEXT = [
  'ishikawa-beta',
  '  Blurry photo',
  '  Process',
  '    Out of focus',
  '  User',
  '    Shaky hands',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const box = (svg: string): number[] =>
  (/viewBox="([^"]*)"/.exec(svg)?.[1] ?? '').split(' ').map(Number);
const title = (svg: string): string | undefined => /<title [^>]*>([^<]*)<\/title>/.exec(svg)?.[1];
/** The line colour the root declares (`--_l`, the theme's `lineColor`). */
const lineColor = (svg: string): string | undefined =>
  /--_l:var\(--mermaid-lineColor,([^)]*)\)/.exec(svg)?.[1];

describe('ishikawa diagrams through the public API (#585)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const result = await createMermaid().render('i1', TEXT);
    expect(result.diagramType).toBe('ishikawa');
    expect(result.svg).toContain('aria-roledescription="ishikawa"');
    expect(result.svg).toContain('class="mermaid mermaid-ishikawa"');
    expect(result.svg.match(/<line class="ishikawa-spine"/g)).toHaveLength(1);
    expect(result.svg.match(/<line class="ishikawa-branch"/g)).toHaveLength(2);
    expect(result.svg.match(/<line class="ishikawa-sub-branch"/g)).toHaveLength(2);
    expect(result.svg.match(/<path class="ishikawa-arrow"/g)).toHaveLength(4);
    expect(title(result.svg)).toBe('Blurry photo');
    for (const absent of ['foreignObject', '<style', '<marker', '<defs'])
      expect(result.svg).not.toContain(absent);
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders through mermaid/slim, byte for byte as mermaid does', async () => {
    const slim = createSlim({ diagrams: [ishikawa] });
    expect((await slim.render('i2', TEXT)).svg).toBe(
      (await createMermaid().render('i2', TEXT)).svg
    );
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('ishikawa');
  });

  it('keeps v12’s detector pattern and place, after radar and before treemap', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('ishikawa')).toBe(types.indexOf('radar') + 1);
    expect(types.indexOf('treemap')).toBe(types.indexOf('ishikawa') + 1);
    const m = createMermaid();
    // Case-insensitive, with a word boundary, as v12's `/^\s*ishikawa(-beta)?\b/i`.
    expect(m.detectType('  ishikawa\n  Effect')).toBe('ishikawa');
    expect(m.detectType('ishikawa-beta\n  Effect')).toBe('ishikawa');
    expect(m.detectType('ISHIKAWA-Beta\n  Effect')).toBe('ishikawa');
    expect(() => m.detectType('ishikawas\n  Effect')).toThrow();
  });

  it('rejects what v12 rejects, detected headers included', async () => {
    const m = createMermaid();
    // The keyword is a token wherever a token starts (T1), so a cause can't start with it.
    const keyword = await rejection(m.render('i3', 'ishikawa\n  Effect\n  ishikawa cause\n'));
    expect(keyword).toBeInstanceOf(MermaidError);
    expect((keyword as MermaidError).code).toBe('SYNTAX');
    // v12 takes `ishikawa-betax` (the word boundary falls after `ishikawa`).
    expect((await m.render('i3', 'ishikawa-betax\n  Effect\n')).diagramType).toBe('ishikawa');
    const e = await rejection(m.render('i3', 'ishikawas\n  Effect\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('honours ishikawa.diagramPadding over its generated default of 20', async () => {
    const m = createMermaid();
    const plain = box((await m.render('i4', TEXT)).svg);
    const padded = box(
      (await m.render('i4', '%%{init: {"ishikawa": {"diagramPadding": 50}}}%%\n' + TEXT)).svg
    );
    expect(padded[0]).toBeCloseTo(plain[0]! - 30, 6);
    expect(padded[1]).toBeCloseTo(plain[1]! - 30, 6);
    // A value the layout cannot use lays out at the default, with no warning.
    const bad = await m.render(
      'i4',
      '%%{init: {"ishikawa": {"diagramPadding": "wide"}}}%%\n' + TEXT
    );
    expect(box(bad.svg)).toEqual(plain);
    const zero = box(
      (await m.render('i4', '---\nconfig:\n  ishikawa:\n    diagramPadding: 0\n---\n' + TEXT)).svg
    );
    expect(zero[0]).toBeCloseTo(plain[0]! + 20, 6);
  });

  it('draws at 100 % width by default (ishikawa.useMaxWidth true), its own size when false', async () => {
    const m = createMermaid();
    const plain = (await m.render('i5', TEXT)).svg;
    expect(plain).toMatch(/<svg [^>]*width="100%"/);
    expect(plain).toMatch(/style="max-width:\d+px/);
    const fixed = (
      await m.render('i5', '---\nconfig:\n  ishikawa:\n    useMaxWidth: false\n---\n' + TEXT)
    ).svg;
    const [, , width, height] = box(fixed);
    expect(fixed).toMatch(new RegExp(`<svg [^>]*width="${width}" height="${height}"`));
    expect(fixed).not.toContain('max-width');
  });

  it('lets an ishikawa-scoped theme win over the top level, and ignores ishikawa.useWidth', async () => {
    const m = createMermaid();
    m.initialize({ theme: 'default' });
    const classic = await m.render('i6', TEXT);
    const dark = await m.render('i6', '---\nconfig:\n  theme: dark\n---\n' + TEXT);
    expect(lineColor(dark.svg)).not.toBe(lineColor(classic.svg));
    const scoped = await m.render('i6', '%%{init: {"ishikawa": {"theme": "dark"}}}%%\n' + TEXT);
    expect(scoped.svg).toBe(dark.svg);
    const width = await m.render('i6', '%%{init: {"ishikawa": {"useWidth": 99}}}%%\n' + TEXT);
    expect(width.svg).toBe(classic.svg);
    expect(width.warnings).toEqual([]);
  });

  it('warns once for clamped causes and for an empty body (D496)', async () => {
    const m = createMermaid();
    const clamped = await m.render(
      'i7',
      'ishikawa-beta\n  Power outage\n    Grid\n      Storm damage\n  Generator\n    Fuel empty\n'
    );
    expect(clamped.warnings.map((w) => w.code)).toEqual(['ISHIKAWA_INDENT_CLAMPED']);
    const empty = await m.render('i7', 'ishikawa\n');
    expect(empty.warnings.map((w) => w.code)).toEqual(['ISHIKAWA_EMPTY']);
    expect(empty.svg).not.toContain('<g class="ishikawa"');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (R-ASCII-5)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('ishikawa', 'svg')).toBe(true);
    expect(m.supportsFormat('ishikawa', 'ascii')).toBe(false);
    const e = await rejection(m.render('i8', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('ishikawa');
  });
});
