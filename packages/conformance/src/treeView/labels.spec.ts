import { describe, expect, it } from 'vitest';
import { treeViewApi } from './render-api.ts';

// Node labels follow the label rule (#1368, T23), through the public `render()`: markdown only
// in a quoted markdown string, tags draw, a written `\n` breaks the line; the rest is drawn as
// written. No treeView label kind is a `v12Markdown` one, so `legacyMarkdown` draws the same.
const SOURCE = [
  'treeView-beta',
  '  "`md **bold** _ital_`"',
  '  plain **bold** _ital_',
  '  `bare **bold**`',
  '  tags <b>bold</b><br>next',
  '  one\\ntwo',
  '  my_file_name.spec.ts',
  '  __init__.py',
].join('\n');

async function render(config: Record<string, unknown> = {}): Promise<string> {
  const api = await treeViewApi(config);
  return (await api.render('m', SOURCE)).svg;
}

describe('treeView node labels (#1368)', () => {
  it('reads markdown in a markdown string only, draws tags and breaks at a written \\n', async () => {
    const svg = await render();
    expect(svg).toContain('<tspan font-weight="bold">bold</tspan>');
    expect(svg).toContain('<tspan font-style="italic">ital</tspan>');
    expect(svg).toContain('<tspan x="20" y="47.35">md </tspan>');
    for (const written of ['plain **bold** _ital_', '`bare **bold**`'])
      expect(svg).toContain(`xml:space="preserve">${written}</text>`);
    expect(svg).toMatch(
      />tags <\/tspan><tspan font-weight="bold">bold<\/tspan><tspan x="[\d.]+" y="[\d.]+">next</
    );
    expect(svg).toMatch(/>one<\/tspan><tspan x="[\d.]+" y="[\d.]+">two</);
    expect(svg).not.toContain('>one\\ntwo<');
  });

  it('draws file names with underscores and dots as written', async () => {
    const svg = await render();
    expect(svg).toContain('xml:space="preserve">my_file_name.spec.ts</text>');
    expect(svg).toContain('xml:space="preserve">__init__.py</text>');
  });

  it('draws the same with legacyMarkdown', async () => {
    expect(await render({ legacyMarkdown: true })).toBe(await render());
  });
});
