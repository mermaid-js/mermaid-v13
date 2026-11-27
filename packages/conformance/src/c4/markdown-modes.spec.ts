// C4 and c4-beta labels through the public API in both label modes (#1368, #1400): the default
// reads markdown only in a quoted markdown string and warns once per render about plain
// emphasis; `markdownAlwaysOn` (global, or in the type's section) draws every label as markdown
// and warns about nothing. The text output follows what the SVG draws.
import { describe, expect, it, vi } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createMermaid } from 'mermaid';

// The first render loads the diagram and the fonts.
vi.setConfig({ testTimeout: 60_000 });

const C4 = [
  'C4Dynamic',
  'Container(c, "label **b** _i_", "techn **b** _i_", "descr **b** _i_")',
  'Boundary(bnd, "boundary **b** _i_", "type **b** _i_") {',
  '  System(s, "S")',
  '}',
  'Rel(c, s, "rel **b** _i_", "rtech **b** _i_")',
].join('\n');
const C4_MD = C4.replace(/"([^"]*\*\*b\*\*[^"]*)"/g, '"`$1`"');

const BETA = [
  'c4-beta dynamic',
  'deploymentNode n "node **b** _i_" "ndescr **b** _i_" "ntech **b** _i_" instances "inst **b** _i_" {',
  '  container c "name **b** _i_" "descr **b** _i_" "tech **b** _i_"',
  '  softwareSystem s "S"',
  '}',
  '1: c --> s : "rel **b** _i_" "rtech **b** _i_"',
].join('\n');
const BETA_MD = BETA.replace(/"([^"]*\*\*b\*\*[^"]*)"/g, '"`$1`"');

const codes = (warnings: readonly { code: string }[]) =>
  warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code).length;
/** The text of every bold `<tspan>`. */
const bold = (svg: string): string[] =>
  [...svg.matchAll(/<tspan\b[^>]*font-weight="bold"[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]!);

describe.each([
  ['c4', C4, C4_MD, 'label b i'],
  ['c4beta', BETA, BETA_MD, 'name b i'],
] as const)('%s labels through createMermaid().render()', (section, src, md, drawn) => {
  it('warns once for plain emphasis in several kinds, and draws it as written', async () => {
    const r = await createMermaid().render('d', src);
    expect(codes(r.warnings)).toBe(1);
    expect(r.svg).toContain('**b** _i_');
  });

  it('warns about nothing for markdown strings, and draws their emphasis', async () => {
    const r = await createMermaid().render('d', md);
    expect(codes(r.warnings)).toBe(0);
    expect(r.svg).not.toContain('**b**');
    expect(bold(r.svg).filter((t) => t === 'b').length).toBeGreaterThan(4);
  });

  it.each([
    ['globally', { markdownAlwaysOn: true }],
    ['in its section', { [section]: { markdownAlwaysOn: true } }],
  ])(
    'with markdownAlwaysOn %s draws every plain label as markdown, unwarned',
    async (_, config) => {
      const m = createMermaid();
      m.initialize(config);
      const r = await m.render('d', src);
      expect(codes(r.warnings)).toBe(0);
      expect(r.svg).not.toContain('**b**');
      expect(r.svg).not.toContain('_i_');
      // The same picture as the markdown strings in the default mode.
      const asMd = await createMermaid().render('d', md);
      expect(r.svg).toBe(asMd.svg);
      // Text output follows what is drawn.
      await m.prepare(src, { format: 'ascii' });
      const text = m.renderSync(src, { format: 'ascii' }).text;
      expect(text).not.toContain('**b**');
      expect(text).toContain(drawn);
    }
  );
});
