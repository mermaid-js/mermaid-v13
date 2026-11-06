import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { DETECTORS } from './generated/detectors.gen.ts';

// The pie chart is a first-party type (#325): `pie` goes to `@mermaid-js/diagram-pie` through
// the generated registry, right after `info` as in v12's detector order.
const TEXT = 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85\n  "Rats" : 15\n';

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

describe('pie charts through the public API (#325)', () => {
  it('renders, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const m = createMermaid();
    const result = await m.render('p1', TEXT);
    expect(result.diagramType).toBe('pie');
    expect(result.svg).toContain('aria-roledescription="pie"');
    expect(result.svg).toContain('class="mermaid mermaid-pie"');
    expect(result.svg.match(/class="pieCircle"/g)).toHaveLength(3);
    expect(result.svg).toContain('Pets');
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('renders markdown strings in the legend and the title (D225)', async () => {
    const m = createMermaid();
    const md = await m.render(
      'p5',
      'pie title "`**Bold** title`"\n  "`*it* x`" : 1\n  "**plain**" : 1\n'
    );
    // No backtick is drawn (the AST ids keep the label as written).
    expect(md.svg).not.toMatch(/>[^<]*`/);
    expect(md.svg).toMatch(/<tspan[^>]*font-weight="bold"[^>]*>Bold<\/tspan>/);
    expect(md.svg).toMatch(/<tspan[^>]*font-style="italic"[^>]*>it<\/tspan>/);
    // Not a markdown string: the stars stay.
    expect(md.svg).toContain('**plain**');
    assertInert(md.svg);
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).diagramType).toBe('pie');
  });

  it('keeps v12’s detector place, after info', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('pie')).toBe(types.indexOf('info') + 1);
    expect(createMermaid().detectType('  pie showData\n"a": 1')).toBe('pie');
  });

  it('honours the pie config section over its generated defaults', async () => {
    const m = createMermaid();
    // Each slice path's arcs: one by default (donutHole 0), outer and inner for a donut.
    const arcs = (svg: string): number[] =>
      [...svg.matchAll(/<path\b[^>]*class="pieCircle"[^>]*>/g)].map(
        (p) => (/\sd="([^"]*)"/.exec(p[0])?.[1] ?? '').match(/A/g)?.length ?? 0
      );
    expect(arcs((await m.render('p3', TEXT)).svg)).toEqual([1, 1, 1]);
    const donut = '%%{init: {"pie": {"donutHole": 0.5}}}%%\n' + TEXT;
    expect(arcs((await m.render('p3', donut)).svg)).toEqual([2, 2, 2]);
  });

  it('takes a themeVariables pie colour', async () => {
    const m = createMermaid();
    m.initialize({ themeVariables: { pie1: '#123456' } });
    expect((await m.render('p4', TEXT)).svg).toContain('#123456');
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('pie', 'svg')).toBe(true);
    expect(m.supportsFormat('pie', 'ascii')).toBe(false);
    const e = await rejection(m.render('p5', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('pie');
  });
});
