import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import type { RenderResult } from 'mermaid';
import { treeViewCorpus } from './corpus.ts';
import { treeViewApi } from './render-api.ts';

// Node labels follow the label rule (#1368, T23), through the public `render()`: markdown only
// in a quoted markdown string, tags draw, a written `\n` breaks the line; the rest is drawn as
// written, and one MARKDOWN_NOT_READ says so. With `markdownAlwaysOn` every name is markdown.
const SOURCE = [
  'treeView-beta',
  '  "`md **bold** _ital_`"',
  '  plain **bold** _ital_',
  '  `bare **bold**`',
  '  tags <b>bold</b><br>next',
  '  one\\ntwo',
  '  dir **bold**/',
  '    my_file_name.spec.ts',
  '    __init__.py',
].join('\n');

async function render(
  config: Record<string, unknown> = {},
  source = SOURCE
): Promise<RenderResult> {
  const api = await treeViewApi(config);
  return api.render('m', source);
}

const codes = (r: RenderResult): string[] => r.warnings.map((w) => w.code);

/** The markdown string, tags and line breaks, drawn the same in both modes. */
function expectRuleBothModes(svg: string): void {
  expect(svg).toContain('<tspan x="20" y="47.35">md </tspan><tspan font-weight="bold">bold');
  expect(svg).toMatch(
    />tags <\/tspan><tspan font-weight="bold">bold<\/tspan><tspan x="[\d.]+" y="[\d.]+">next</
  );
  expect(svg).toMatch(/>one<\/tspan><tspan x="[\d.]+" y="[\d.]+">two</);
  expect(svg).not.toContain('>one\\ntwo<');
}

describe('treeView node labels (#1368), default mode', () => {
  it('reads markdown in a markdown string only, draws tags and breaks at a written \\n', async () => {
    const { svg } = await render();
    expectRuleBothModes(svg);
    for (const written of ['plain **bold** _ital_', '`bare **bold**`', 'dir **bold**'])
      expect(svg).toContain(`xml:space="preserve">${written}</text>`);
  });

  it('draws file names with underscores and dots as written', async () => {
    const { svg } = await render();
    expect(svg).toContain('xml:space="preserve">my_file_name.spec.ts</text>');
    expect(svg).toContain('xml:space="preserve">__init__.py</text>');
  });

  it('warns once of markdown in plain names; never for markdown strings or file names', async () => {
    expect(codes(await render())).toEqual([MARKDOWN_NOT_READ.code]);
    const quiet = 'treeView-beta\n  "`**a**`"\n  __init__.py\n  my_file_name.ts\n';
    expect(codes(await render({}, quiet))).toEqual([]);
  });
});

describe.each([
  ['globally', { markdownAlwaysOn: true }],
  ['in the treeView section', { treeView: { markdownAlwaysOn: true } }],
])('treeView node labels (#1368), markdownAlwaysOn set %s', (_where, config) => {
  it('draws every plain name as markdown, with no warning', async () => {
    const r = await render(config);
    expectRuleBothModes(r.svg);
    expect(r.svg).toContain('>plain </tspan><tspan font-weight="bold">bold</tspan>');
    expect(r.svg).toContain('<tspan font-style="italic">ital</tspan>');
    // A directory is bold already: its `**bold**` loses its marks and stays bold.
    expect(r.svg).toMatch(/font-weight="bold">dir bold<\/tspan><\/text>/);
    expect(r.svg).not.toContain('>`bare');
    expect(codes(r)).toEqual([]);
  });

  it('reads __init__.py as bold init, and leaves my_file_name.spec.ts as written', async () => {
    const { svg } = await render(config);
    expect(svg).toMatch(/<tspan [^>]*font-weight="bold">init<\/tspan><tspan>\.py<\/tspan>/);
    expect(svg).toContain('xml:space="preserve">my_file_name.spec.ts</text>');
  });
});

describe('the label fixtures', () => {
  it('draws label-syntax-compat.mmd with markdown in its plain names', async () => {
    const corpus = await treeViewCorpus();
    const source = (name: string): string =>
      corpus.find((c) => c.id.endsWith(`pr-check/${name}.mmd`))!.source;
    const on = await render({}, source('label-syntax-compat'));
    const off = await render({}, source('label-syntax'));
    expect(on.svg).toContain('>unquoted </tspan><tspan font-weight="bold">bold</tspan>');
    expect(off.svg).toContain('xml:space="preserve">unquoted **bold** _ital_</text>');
    expect(codes(on)).toEqual([]);
    expect(codes(off)).toEqual([MARKDOWN_NOT_READ.code]);
  });
});
