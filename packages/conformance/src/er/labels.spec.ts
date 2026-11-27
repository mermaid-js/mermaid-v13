// ER labels through the public render (#1368, D731): Markdown only in a markdown string, plain
// markdown as v12 drew it with `legacyMarkdown`, and one MARKDOWN_NOT_READ warning per render.
import { describe, expect, it } from 'vitest';
import { createMermaid, type MermaidConfig } from 'mermaid';
import { parseSvg, type SvgView } from '../svg-tree.ts';

const MARKDOWN_NOT_READ = 'MARKDOWN_NOT_READ';

/** Every ER label kind holding `label(kind)`. */
const diagram = (label: (kind: string) => string): string =>
  [
    'erDiagram',
    `  E[${label('alias')}] {`,
    `    string name ${label('comment')}`,
    '  }',
    `  E ||--o{ F : ${label('relationship')}`,
    `  subgraph S[${label('subgraph')}]`,
    '    F',
    '  end',
  ].join('\n');

const PLAIN = diagram((k) => `"${k} **bold** _ital_"`);
const MARKDOWN = diagram((k) => `"\`${k} **bold** _ital_\`"`);

const render = (source: string, config: MermaidConfig = {}) => {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m.render('mermaid-0', source, { config });
};

/** The texts drawn bold (`font-weight: bold` or 700 on a tspan). */
const boldTexts = (tree: SvgView): string[] =>
  tree
    .find((n, t) => t.tag(n) === 'tspan' && /bold|700/.test(t.getAttr(n, 'font-weight') ?? ''))
    .map(
      (n) =>
        tree.textOf(n) ??
        tree
          .children(n)
          .map((c) => tree.textOf(c) ?? '')
          .join('')
    );

describe('ER labels through render()', () => {
  it('gives one MARKDOWN_NOT_READ for a diagram with several plain markdown labels', async () => {
    const { svg, warnings } = await render(PLAIN);
    expect(warnings.filter((w) => w.code === MARKDOWN_NOT_READ)).toHaveLength(1);
    for (const kind of ['alias', 'comment', 'relationship', 'subgraph'])
      expect(svg).toContain(`${kind} **bold** _ital_`);
  });

  it('draws plain markdown as v12 did and gives no warning with legacyMarkdown', async () => {
    const { svg, warnings } = await render(PLAIN, { legacyMarkdown: true });
    expect(warnings.filter((w) => w.code === MARKDOWN_NOT_READ)).toEqual([]);
    expect(svg).not.toContain('**bold**');
    expect(boldTexts(parseSvg(svg))).toEqual(['bold', 'bold', 'bold', 'bold']);
  });

  it('reads markdown strings without their backticks, and gives no warning', async () => {
    for (const config of [{}, { legacyMarkdown: true }]) {
      const { svg, warnings } = await render(MARKDOWN, config);
      expect(warnings.filter((w) => w.code === MARKDOWN_NOT_READ)).toEqual([]);
      expect(svg).not.toContain('`');
      expect(svg).not.toContain('**bold**');
      expect(boldTexts(parseSvg(svg))).toEqual(['bold', 'bold', 'bold', 'bold']);
    }
  });

  it('gives the text output what the SVG draws, and one warning', async () => {
    const m = createMermaid();
    const plain = await m.render('x', PLAIN, { format: 'ascii' });
    expect(plain.warnings.filter((w) => w.code === MARKDOWN_NOT_READ)).toHaveLength(1);
    expect(plain.text).toContain('alias **bold** _ital_');
    const marked = await m.render('x', MARKDOWN, { format: 'ascii' });
    expect(marked.warnings.filter((w) => w.code === MARKDOWN_NOT_READ)).toEqual([]);
    expect(marked.text).toContain('alias bold ital');
    expect(marked.text).not.toContain('`');
  });
});
