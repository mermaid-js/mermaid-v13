import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError } from './index.ts';
import { DETECTORS } from './generated/detectors.gen.ts';
import { VERSION } from './version.ts';

// The info diagram is a first-party type (#420): `info` goes to `@mermaid-js/diagram-info`
// through the generated registry, between gantt and pie as in v12's detector order. It draws
// one line, `v<version>`, where the version is this package's own (Q1).

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

describe('info diagrams through the public API (#420)', () => {
  it('renders the mermaid version, where it was UNSUPPORTED_DIAGRAM before the port', async () => {
    const m = createMermaid();
    const result = await m.render('i1', 'info');
    expect(result.diagramType).toBe('info');
    expect(result.svg).toContain('aria-roledescription="info"');
    expect(result.svg).toContain('class="mermaid mermaid-info"');
    expect(result.svg).toMatch(new RegExp(`<text[^>]*class="version"[^>]*>v${VERSION}</text>`));
    expect(result.warnings).toEqual([]);
    assertInert(result.svg);
  });

  it('accepts showInfo and draws nothing extra (Q3)', async () => {
    const m = createMermaid();
    const plain = await m.render('i2', 'info');
    const shown = await m.render('i2', 'info showInfo');
    expect(shown.warnings).toEqual([]);
    expect(shown.svg).toBe(plain.svg);
  });

  it('rejects what v12 rejects', async () => {
    const m = createMermaid();
    const e = await rejection(m.render('i3', 'info unsupported'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
  });

  it('names the SVG from accTitle and accDescr, and draws no title (D133, D218)', async () => {
    const m = createMermaid();
    const r = await m.render(
      'i4',
      'info\ntitle Drawn nowhere\naccTitle: Version\naccDescr: The build'
    );
    expect(r.svg).toContain('<title id="i4-title">Version</title>');
    expect(r.svg).toContain('<desc id="i4-desc">The build</desc>');
    expect(r.svg).not.toContain('Drawn nowhere');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare('info');
    expect(m.renderSync('info').diagramType).toBe('info');
  });

  it('keeps v12’s detector place, before pie', () => {
    const types = DETECTORS.map((d) => d.type);
    expect(types.indexOf('info')).toBe(types.indexOf('pie') - 1);
    expect(createMermaid().detectType('  info showInfo')).toBe('info');
  });

  it('draws the version as one line of text (Q2)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('info', 'ascii')).toBe(true);
    for (const charset of ['unicode', 'ascii'] as const) {
      const r = await m.render('i5', 'info showInfo', {
        format: 'ascii',
        config: { ascii: { charset } },
      });
      expect(r.format).toBe('ascii');
      expect(r.text).toBe(`v${VERSION}`);
    }
  });
});
