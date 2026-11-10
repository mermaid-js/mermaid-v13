import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { ishikawa } from '@mermaid-js/diagram-ishikawa';
import { createMermaid, MermaidError } from './index.ts';
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
    // The keyword is a token wherever a token starts (the lexer, as v12's), so a cause can't start with it.
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
    // The public warning has no `related`: its message names every clamped cause.
    const five = await m.render('i7', 'ishikawa-beta\nP\n    A\n  B\n  C\n  D\n  E\n  F\n');
    const [clampWarning] = five.warnings;
    expect(clampWarning?.message).toContain(
      ': `B` at line 4, `C` at line 5, `D` at line 6, `E` at line 7, `F` at line 8. Indent them'
    );
    expect(clampWarning?.message).not.toContain('….');
    const empty = await m.render('i7', 'ishikawa\n');
    expect(empty.warnings.map((w) => w.code)).toEqual(['ISHIKAWA_EMPTY']);
    expect(empty.svg).not.toContain('<g class="ishikawa"');
  });

  it('draws the outline as text (D498): the effect in a box, the causes as a tree', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('ishikawa', 'svg')).toBe(true);
    expect(m.supportsFormat('ishikawa', 'ascii')).toBe(true);
    const result = await m.render('i8', TEXT, { format: 'ascii' });
    expect(result.format).toBe('ascii');
    expect(result.diagramType).toBe('ishikawa');
    expect(result.warnings).toEqual([]);
    expect(result.text).toBe(
      [
        '┌──────────────┐',
        '│ Blurry photo │',
        '└─┬────────────┘',
        '  ├── Process',
        '  │   └── Out of focus',
        '  └── User',
        '      └── Shaky hands',
      ].join('\n')
    );
    expect([result.columns, result.rows]).toEqual([22, 7]);
  });

  it('draws the ascii charset with tree(1)’s ASCII connectors', async () => {
    const result = await createMermaid().render('i9', TEXT, {
      format: 'ascii',
      ascii: { charset: 'ascii' },
    });
    expect(result.text).toBe(
      [
        '+--------------+',
        '| Blurry photo |',
        '+-+------------+',
        '  |-- Process',
        '  |   `-- Out of focus',
        '  `-- User',
        '      `-- Shaky hands',
      ].join('\n')
    );
  });

  it('writes labels as plain text: entities decoded, a <br> a space, as the SVG <title>', async () => {
    const text = 'ishikawa\n  Late &amp; cold<br>food\n  Rider\n    Lost<br/>twice\n';
    const result = await createMermaid().render('i10', text, { format: 'ascii' });
    expect(result.text).toBe(
      [
        '┌──────────────────┐',
        '│ Late & cold food │',
        '└─┬────────────────┘',
        '  └── Rider',
        '      └── Lost twice',
      ].join('\n')
    );
  });

  it('centres the front-matter title on the first line (D82), apart from the effect (D492)', async () => {
    const text = '---\ntitle: Why\n---\nishikawa\n  Blurry photo\n  Process\n';
    const result = await createMermaid().render('i13', text, { format: 'ascii' });
    expect(result.text).toBe(
      [
        '      Why',
        '┌──────────────┐',
        '│ Blurry photo │',
        '└─┬────────────┘',
        '  └── Process',
      ].join('\n')
    );
  });

  it('draws an effect with no causes as its box alone, and an empty body as no text', async () => {
    const m = createMermaid();
    expect((await m.render('i11', 'ishikawa\n  Alone\n', { format: 'ascii' })).text).toBe(
      ['┌───────┐', '│ Alone │', '└───────┘'].join('\n')
    );
    const empty = await m.render('i11', 'ishikawa\n', { format: 'ascii' });
    expect(empty.text).toBe('');
    expect(empty.warnings.map((w) => w.code)).toEqual(['ISHIKAWA_EMPTY']);
  });

  it('draws an empty body with a front-matter title as the title line alone (D82)', async () => {
    const m = createMermaid();
    const empty = await m.render('i15', '---\ntitle: " Why  not "\n---\nishikawa\n', {
      format: 'ascii',
    });
    expect([empty.text, empty.rows, empty.columns]).toEqual(['Why not', 1, 7]);
    expect(empty.warnings.map((w) => w.code)).toEqual(['ISHIKAWA_EMPTY']);
  });

  it('writes the front-matter title on one line, the same in the SVG <title> and the text', async () => {
    const m = createMermaid();
    const text = '---\ntitle: " Why\\tit  failed "\n---\nishikawa\n  Blurry photo\n';
    expect(title((await m.render('i16', text)).svg)).toBe('Why it failed');
    expect((await m.render('i16', text, { format: 'ascii' })).text.split('\n')[0]).toBe(
      ' Why it failed'
    );
  });

  it('draws a 1,000-deep chain one cause a line, the last 4 columns a level in (a loop, no recursion)', async () => {
    const chain = Array.from({ length: 1_000 }, (_, i) => `${' '.repeat(i + 2)}c${i}\n`).join('');
    const m = createMermaid();
    m.initialize({ maxTextSize: 1_000_000 });
    const result = await m.render('i14', `ishikawa\n  E\n${chain}`, { format: 'ascii' });
    const lines = result.text.split('\n');
    expect(lines).toHaveLength(3 + 1_000);
    expect(lines.at(-1)).toBe(`${' '.repeat(2 + 4 * 999)}└── c999`);
  });

  it('is never cropped: wider than ascii.maxWidth, it warns ASCII_TOO_WIDE, and drops emphasis with ASCII_DROPPED', async () => {
    const text = 'ishikawa\n  Effect\n  A <b>bold</b> cause that is long\n';
    const result = await createMermaid().render('i12', text, {
      format: 'ascii',
      ascii: { maxWidth: 20 },
    });
    expect(result.text.split('\n').at(-1)).toBe('  └── A bold cause that is long');
    expect(result.columns).toBe(31);
    expect(result.warnings.map((w) => [w.code, (w as { astIds?: string[] }).astIds])).toEqual([
      ['ASCII_DROPPED', ['cause:1']],
      ['ASCII_TOO_WIDE', undefined],
    ]);
  });
});
