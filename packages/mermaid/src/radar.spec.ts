import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { radar } from '@mermaid-js/diagram-radar';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

// Radar charts are a first-party type (#449): `radar-beta` goes to `@mermaid-js/diagram-radar`
// through the generated registry, after treeView and before ishikawa as in v12, and no longer
// fails with UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const TEXT = [
  'radar-beta',
  '  title Skills',
  '  axis a["Speed"], b["Power"], c["Range"]',
  '  curve x["Ann"]{1, 2, 3}',
  '  curve y["Bo"]{3, 2, 1}',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string) => `---\nconfig:\n  radar:\n${body}---\n${TEXT}`;
const viewBox = (svg: string) => /viewBox="([^"]*)"/.exec(svg)?.[1];

describe('radar charts through the public API (#449)', () => {
  it('renders radar-beta, which was UNSUPPORTED_DIAGRAM before', async () => {
    const result = await createMermaid().render('r', TEXT);
    expect(result.diagramType).toBe('radar');
    expect(result.svg).toContain('aria-roledescription="radar"');
    expect(result.svg).toContain('class="mermaid mermaid-radar"');
    expect(result.svg).toContain('>Speed</text>');
    expect(result.svg).toContain('>Ann</text>');
    expect(result.svg).toContain('>Skills</text>');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it("detects v12's pattern only: `radar` alone is not a radar chart", async () => {
    const e = await rejection(createMermaid().render('r', 'radar\n  axis A\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('draws a front-matter title, and an in-text title wins (D218)', async () => {
    const m = createMermaid();
    const fm = await m.render('r', '---\ntitle: From front matter\n---\nradar-beta\n  axis A\n');
    expect(fm.svg).toContain('>From front matter</text>');
    const both = await m.render('r', `---\ntitle: Front\n---\n${TEXT}`);
    expect(both.svg).toContain('>Skills</text>');
    expect(both.svg).not.toContain('>Front</text>');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).svg).toContain('mermaid-radar');
  });

  it('reports a syntax error as a positioned MermaidError', async () => {
    const e = await rejection(createMermaid().render('r', 'radar-beta\n  axis A\n  curve c{1,\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBeGreaterThan(1);
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D320)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('radar', 'svg')).toBe(true);
    expect(m.supportsFormat('radar', 'ascii')).toBe(false);
    const e = await rejection(m.render('r', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('radar');
  });

  it('reads the radar config section (useMaxWidth, the canvas and the curve keys)', async () => {
    const m = createMermaid();
    const plain = await m.render('r', TEXT);
    expect(plain.svg).toMatch(/<svg[^>]* width="100%"/);
    expect((await m.render('r', withConfig('    useMaxWidth: false\n'))).svg).toMatch(
      /<svg[^>]* width="\d/
    );
    const big = await m.render('r', withConfig('    width: 800\n    height: 800\n'));
    expect(big.warnings).toEqual([]);
    expect(big.width).toBeGreaterThan(plain.width + 150);
    const keys = [
      '    marginTop: 80\n',
      '    marginRight: 10\n',
      '    marginBottom: 90\n',
      '    marginLeft: 70\n',
      '    axisScaleFactor: 0.5\n',
      '    axisLabelFactor: 1.4\n',
      '    curveTension: 0.5\n',
    ];
    for (const body of keys) {
      const r = await m.render('r', withConfig(body));
      expect(r.warnings, body).toEqual([]);
      expect(r.svg, body).not.toBe(plain.svg);
    }
  });

  it('warns once per bad radar key and draws with the default (D356)', async () => {
    const m = createMermaid();
    const plain = await m.render('r', TEXT);
    const bad = await m.render('r', withConfig('    width: wide\n    curveTension: 3\n'));
    expect(bad.warnings.map((w) => w.code)).toEqual([
      'RADAR_CONFIG_INVALID',
      'RADAR_CONFIG_INVALID',
    ]);
    expect(bad.warnings[0]!.message).toContain('radar.width');
    expect(bad.svg).toBe(plain.svg);
    // A numeric string reads as its number, as the other ports' lengths do.
    const text = await m.render('r', withConfig('    width: "800"\n'));
    expect(text.warnings).toEqual([]);
    expect(viewBox(text.svg)).toBe(
      viewBox((await m.render('r', withConfig('    width: 800\n'))).svg)
    );
  });

  it('accepts useWidth without a warning and draws nothing different (ignored)', async () => {
    const m = createMermaid();
    const plain = await m.render('r', TEXT);
    const set = await m.render('r', withConfig('    useWidth: 900\n'));
    expect(set.warnings).toEqual([]);
    expect(set.svg).toBe(plain.svg);
  });

  it('renders through mermaid/slim with the radar plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [radar] });
    expect((await slim.render('r', TEXT)).svg).toBe((await createMermaid().render('r', TEXT)).svg);
  });
});
