// ER labels through the public render (#1368, D731): Markdown only in a markdown string, every
// label as markdown with `markdownAlwaysOn`, and one MARKDOWN_NOT_READ warning per render.
import { describe, expect, it } from 'vitest';
import { createMermaid, type MermaidConfig } from 'mermaid';
import { parseSvg, type SvgView } from '../svg-tree.ts';

const MARKDOWN_NOT_READ = 'MARKDOWN_NOT_READ';

/** Every ER label kind holding `label(kind)`, and an attribute of plain `**t** _n_` cells. */
const diagram = (label: (kind: string) => string): string =>
  [
    'erDiagram',
    `  E[${label('alias')}] {`,
    `    string name ${label('comment')}`,
    '  }',
    `  E ||--o{ F : ${label('relationship')}`,
    `  ${label('entity')} ||--o{ E : x`,
    `  subgraph S[${label('subgraph')}]`,
    '    F',
    '  end',
  ].join('\n');

const KINDS = ['alias', 'comment', 'relationship', 'entity', 'subgraph'];
const PLAIN = diagram((k) => `"${k} **bold** _ital_"`);
const MARKDOWN = diagram((k) => `"\`${k} **bold** _ital_\`"`);
const CELLS = 'erDiagram\n  E {\n    **cellType** _cellName_\n  }\n';

/** The setting, globally and through the ER section. */
const ALWAYS: Record<string, MermaidConfig> = {
  global: { markdownAlwaysOn: true },
  er: { er: { markdownAlwaysOn: true } },
};

const render = (source: string, config: MermaidConfig = {}) => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m.render('mermaid-0', source, { config });
};

/** The texts of the tspans whose `attr` matches `value`. */
const styled = (tree: SvgView, attr: string, value: RegExp): string[] =>
  tree
    .find((n, t) => t.tag(n) === 'tspan' && value.test(t.getAttr(n, attr) ?? ''))
    .map(
      (n) =>
        tree.textOf(n) ??
        tree
          .children(n)
          .map((c) => tree.textOf(c) ?? '')
          .join('')
    );
/** Every drawn text, its tspans joined: what a reader sees, not the ids. */
const drawnTexts = (svg: string): string =>
  [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)]
    .map((m) => (m[1] ?? '').replace(/<[^>]+>/g, ''))
    .join('\n');
const boldTexts = (tree: SvgView) => styled(tree, 'font-weight', /bold|700/);
const italicTexts = (tree: SvgView) => styled(tree, 'font-style', /italic/);
const notRead = (warnings: readonly { code: string }[]) =>
  warnings.filter((w) => w.code === MARKDOWN_NOT_READ);

describe('ER labels through render()', () => {
  it('gives one MARKDOWN_NOT_READ for a diagram with several plain markdown labels', async () => {
    const { svg, warnings } = await render(PLAIN);
    expect(notRead(warnings)).toHaveLength(1);
    for (const kind of KINDS) expect(drawnTexts(svg)).toContain(`${kind} **bold** _ital_`);
  });

  it('reads markdown strings without their backticks, and gives no warning', async () => {
    for (const config of [{}, ...Object.values(ALWAYS)]) {
      const { svg, warnings } = await render(MARKDOWN, config);
      expect(notRead(warnings)).toEqual([]);
      expect(drawnTexts(svg)).not.toMatch(/`|\*\*/);
      expect(boldTexts(parseSvg(svg))).toEqual(KINDS.map(() => 'bold'));
    }
  });

  it('gives the text output what the SVG draws, and one warning', async () => {
    const m = createMermaid();
    const plain = await m.render('x', PLAIN, { format: 'ascii' });
    expect(notRead(plain.warnings)).toHaveLength(1);
    expect(plain.text).toContain('alias **bold** _ital_');
    const marked = await m.render('x', MARKDOWN, { format: 'ascii' });
    expect(notRead(marked.warnings)).toEqual([]);
    expect(marked.text).toContain('alias bold ital');
    expect(marked.text).not.toContain('`');
  });
});

describe.each(Object.entries(ALWAYS))('ER labels with markdownAlwaysOn (%s)', (_, on) => {
  it('draws plain **b** _i_ bold and italic in every label kind, with no warning', async () => {
    const { svg, warnings } = await render(PLAIN, on);
    expect(notRead(warnings)).toEqual([]);
    expect(drawnTexts(svg)).not.toMatch(/\*\*|_ital_/);
    const tree = parseSvg(svg);
    expect(boldTexts(tree)).toEqual(KINDS.map(() => 'bold'));
    expect(italicTexts(tree)).toEqual(KINDS.map(() => 'ital'));
  });

  it('draws attribute type and name cells as markdown', async () => {
    const tree = parseSvg((await render(CELLS, on)).svg);
    expect(boldTexts(tree)).toEqual(['cellType']);
    expect(italicTexts(tree)).toEqual(['cellName']);
  });

  it('draws tags and a written \\n as the default mode does', async () => {
    const src = 'erDiagram\n  E ||--o{ F : "r <b>b</b><br>one\\ntwo"\n';
    expect((await render(src, on)).svg).toBe((await render(src)).svg);
  });

  it('gives the text output what the SVG draws', async () => {
    const text = await createMermaid().render('x', PLAIN, { format: 'ascii', config: on });
    expect(notRead(text.warnings)).toEqual([]);
    expect(text.text).toContain('alias bold ital');
    expect(text.text).not.toContain('**');
  });
});
