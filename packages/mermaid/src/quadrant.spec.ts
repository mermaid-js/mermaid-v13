import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { quadrant } from '@mermaid-js/diagram-quadrant';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

// Quadrant charts are a first-party type (#317): `quadrantChart` goes to
// `@mermaid-js/diagram-quadrant` through the generated registry, after journey and before
// sankey as in v12, and no longer fails with UNSUPPORTED_DIAGRAM (R-COMPAT-7).
const TEXT = [
  'quadrantChart',
  '  title Reach and engagement',
  '  x-axis Low Reach --> High Reach',
  '  y-axis Low Engagement --> High Engagement',
  '  quadrant-1 We should expand',
  '  Campaign A: [0.3, 0.6]',
  '',
].join('\n');

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

const withConfig = (body: string) => `---\nconfig:\n  quadrantChart:\n${body}---\n${TEXT}`;

describe('quadrant charts through the public API (#317)', () => {
  it('renders quadrantChart, which was UNSUPPORTED_DIAGRAM before', async () => {
    const result = await createMermaid().render('q', TEXT);
    expect(result.diagramType).toBe('quadrantChart');
    expect(result.svg).toContain('aria-roledescription="quadrantChart"');
    expect(result.svg).toContain('class="mermaid mermaid-quadrant"');
    expect(result.svg).toContain('>Campaign A</text>');
    expect(result.svg).toContain('>We should expand</text>');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('detects it case-sensitively, as v12', async () => {
    const e = await rejection(createMermaid().render('q', 'quadrantchart\n  A: [0.5, 0.5]\n'));
    expect((e as MermaidError).code).toBe('UNSUPPORTED_DIAGRAM');
  });

  it('draws a front-matter title, and an in-text title wins (D218)', async () => {
    const m = createMermaid();
    const fm = await m.render('q', '---\ntitle: From front matter\n---\nquadrantChart\n');
    expect(fm.svg).toContain('>From front matter</text>');
    const both = await m.render('q', `---\ntitle: Front\n---\n${TEXT}`);
    expect(both.svg).toContain('>Reach and engagement</text>');
    expect(both.svg).not.toContain('>Front</text>');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).svg).toContain('mermaid-quadrant');
  });

  it('reports a syntax error as a positioned MermaidError', async () => {
    const e = await rejection(createMermaid().render('q', 'quadrantChart\n  A: [0.1,\n'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBeGreaterThan(1);
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D216, R-ASCII-5)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('quadrantChart', 'svg')).toBe(true);
    expect(m.supportsFormat('quadrantChart', 'ascii')).toBe(false);
    const e = await rejection(m.render('q', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('quadrantChart');
    await m.prepare(TEXT);
    expect(() => m.renderSync(TEXT, { format: 'ascii' })).toThrow(UnsupportedFormatError);
  });

  it('reads the quadrantChart config section (useMaxWidth, chartWidth)', async () => {
    const m = createMermaid();
    expect((await m.render('q', TEXT)).svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('q', withConfig('    useMaxWidth: false\n'));
    expect(fixed.svg).toMatch(/<svg[^>]* width="500"/);
    const big = await m.render('q', withConfig('    chartWidth: 800\n'));
    expect(big.width).toBe(800);
    expect(big.warnings).toEqual([]);
  });

  it('accepts useWidth without a warning and draws nothing different (ignored)', async () => {
    const m = createMermaid();
    const plain = await m.render('q', TEXT);
    const set = await m.render('q', withConfig('    useWidth: 900\n'));
    expect(set.warnings).toEqual([]);
    expect(set.svg).toBe(plain.svg);
  });

  it("warns for v12's builder-only showTitle, which is not a config key (R-CONF-2)", async () => {
    const m = createMermaid();
    const { svg, warnings } = await m.render('q', withConfig('    showTitle: false\n'));
    expect(warnings.map((w) => w.code)).toEqual(['CONFIG_UNKNOWN_KEY']);
    expect(svg).toContain('>Reach and engagement</text>');
  });

  it('renders through mermaid/slim with the quadrant plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [quadrant] });
    expect((await slim.render('q', TEXT)).svg).toBe((await createMermaid().render('q', TEXT)).svg);
  });
});
