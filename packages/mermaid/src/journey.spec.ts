import { describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { journey } from '@mermaid-js/diagram-journey';
import { createMermaid, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

// User journey is a first-party type (#327): `journey` goes to `@mermaid-js/diagram-journey`
// through the generated registry, between stateDiagram and quadrantChart as in v12.
const TEXT = 'journey\n  title My day\n  section Work\n    Make tea: 5: Me\n';

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

describe('user journeys through the public API (#327)', () => {
  it('supports svg only: ascii is refused with UnsupportedFormatError (D216)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('journey', 'svg')).toBe(true);
    expect(m.supportsFormat('journey', 'ascii')).toBe(false);
    const e = await rejection(m.render('j', TEXT, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('journey');
  });

  it('renders a journey', async () => {
    const result = await createMermaid().render('j1', TEXT);
    expect(result.diagramType).toBe('journey');
    expect(result.svg).toContain('aria-roledescription="journey"');
    expect(result.svg).toContain('class="mermaid mermaid-journey"');
    expect(result.svg).toContain('My day');
    expect(result.svg).toContain('Make tea');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(TEXT);
    expect(m.renderSync(TEXT).svg).toContain('mermaid-journey');
  });

  it('fills sections from the theme: v12 forest values (#327)', async () => {
    const forest = await createMermaid().render('j', '---\nconfig:\n  theme: forest\n---\n' + TEXT);
    expect(forest.svg).toContain('#cde498');
  });

  it('reads the journey config section (useMaxWidth, leftMargin, sectionColours)', async () => {
    const m = createMermaid();
    const wide = await m.render('j', TEXT);
    expect(wide.svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render(
      'j',
      '---\nconfig:\n  journey:\n    useMaxWidth: false\n---\n' + TEXT
    );
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d+(\.\d+)?"/);
    const roomy = await m.render(
      'j',
      '---\nconfig:\n  journey:\n    leftMargin: 400\n---\n' + TEXT
    );
    expect(roomy.width).toBeGreaterThan(wide.width);
    // v12 read sectionColours once at module load; a per-diagram value now applies.
    const coloured = await m.render(
      'j',
      "---\nconfig:\n  journey:\n    sectionColours: ['#b91c1c']\n---\n" + TEXT
    );
    expect(coloured.svg).toContain('#b91c1c');
    expect(wide.svg).not.toContain('#b91c1c');
  });

  it("maps each task dot to its actor mention; '' draws none and legend rows carry data-id only", async () => {
    const { svg } = await createMermaid().render('j', 'journey\n  A: 5: Me, , You\n  B: 3: Me,\n');
    const dots = [...svg.matchAll(/<circle class="actor-\d+" data-ast="([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(dots).toEqual(['a:Me', 'a:You', 'a:Me@2']);
    expect(svg).toContain('data-id="a:Me"');
    expect(svg).not.toMatch(/legend-entry[^>]*data-ast/);
  });

  it('warns once for scores outside 0-5 (D226)', async () => {
    const { warnings } = await createMermaid().render('j', 'journey\n  A: 7: Me\n  B: x: Me\n');
    expect(warnings.map((w) => w.code)).toEqual(['JOURNEY_SCORE']);
  });

  it('renders through mermaid/slim with the journey plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [journey] });
    expect((await slim.render('j', TEXT)).svg).toBe((await createMermaid().render('j', TEXT)).svg);
  });
});
