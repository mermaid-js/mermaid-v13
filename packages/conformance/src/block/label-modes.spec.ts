import { beforeAll, describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createMermaid } from 'mermaid';

/**
 * Block labels through the public API (#1368, #1401): a plain label of every kind (shape, block
 * arrow, composite header, edge) draws its emphasis marks as written and gives the render one
 * `MARKDOWN_NOT_READ` warning; with `markdownAlwaysOn` (globally or in the `block` section) every
 * label draws bold and italic, in the SVG and in the text output, with no warning; a markdown
 * string draws as markdown with no warning in either mode.
 */
const PLAIN = [
  'block',
  '  p["**shape** _ital_"]',
  '  q<["**arrow** _ital_"]>(right)',
  '  r -- "**edge** _ital_" --> s',
  '  block:k["**group** _ital_"]',
  '    l',
  '  end',
].join('\n');
const STRINGS = 'block\n  a["`**x**`"]\n  b<["`**y**`"]>(up)\n  c -- "`**z**`" --> d';
const KINDS = ['shape', 'arrow', 'edge', 'group'];

const mermaid = createMermaid();
mermaid.initialize({ deterministic: true });

// The first render loads the block plugin and its text entry.
beforeAll(async () => {
  await mermaid.render('w', 'block\n  a');
  await mermaid.render('w', 'block\n  a', { format: 'ascii' });
}, 60_000);

const notRead = (warnings: readonly { code: string }[]): number =>
  warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code).length;
const bold = (svg: string, word: string): boolean =>
  new RegExp(`font-weight="bold"[^>]*>${word}<`).test(svg);
const italic = (svg: string): boolean => /font-style="italic"[^>]*>ital</.test(svg);

describe('block label modes through the API (#1401)', () => {
  it('default mode: plain labels draw their marks, with one warning for the render', async () => {
    const { svg, warnings } = await mermaid.render('b', PLAIN);
    for (const kind of KINDS) {
      expect(svg, kind).toContain(`**${kind}** _ital_`);
      expect(bold(svg, kind), kind).toBe(false);
    }
    expect(notRead(warnings)).toBe(1);
    const text = await mermaid.render('b', PLAIN, { format: 'ascii' });
    expect(text.text).toContain('**shape** _ital_');
  });

  for (const [how, config] of [
    ['globally', { markdownAlwaysOn: true }],
    ['in the block section', { block: { markdownAlwaysOn: true } }],
  ] as const) {
    it(`markdownAlwaysOn ${how}: every label kind draws bold and italic, with no warning`, async () => {
      const { svg, warnings } = await mermaid.render('b', PLAIN, { config });
      for (const kind of KINDS) expect(bold(svg, kind), kind).toBe(true);
      expect(italic(svg)).toBe(true);
      expect(svg).not.toContain('**');
      expect(notRead(warnings)).toBe(0);
      const text = await mermaid.render('b', PLAIN, { format: 'ascii', config });
      expect(text.text).not.toContain('**');
      expect(text.text).toContain('shape ital');
    });
  }

  it('markdown strings draw bold in both modes, with no warning', async () => {
    for (const config of [{}, { markdownAlwaysOn: true }]) {
      const { svg, warnings } = await mermaid.render('b', STRINGS, { config });
      for (const word of ['x', 'y', 'z']) expect(bold(svg, word), word).toBe(true);
      expect(notRead(warnings)).toBe(0);
    }
  });
});
