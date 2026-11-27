/**
 * Treemap labels through the label handler (#1368, #1403), read back from what `render()` draws
 * for `treemap/pr-check/label-syntax.mmd`. Only a quoted markdown string is markdown, in a
 * section or leaf name, whose quotes the parser removes and whose markdown string it marks;
 * plain markers and a code span are drawn as written; tags draw and a written `\n` breaks. A
 * section header is one line high: it keeps a label's first line, with `...` after it. With
 * `markdownAlwaysOn` every label is markdown (`label-syntax-compat.mmd` is that fixture with the
 * setting on), and the default mode warns once per render about markdown in a plain label.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, `e2e/diagrams/treemap/pr-check/${name}.mmd`), 'utf8');
const SOURCE = fixture('label-syntax');

/** What `label-syntax.mmd` draws in the default mode. */
const DEFAULT = [
  'title **bold** _ital_ / next H2O',
  'section **bold** _ital_',
  'section bold [i:ital]',
  'section a `code` b',
  'section bold [i:ital...]',
  'section one...',
  'leaf **bold** _ital_',
  'leaf [b:bold] [i:ital]',
  'leaf a `code` b',
  'leaf [b:bold] [i:ital] / next H2O',
  'leaf one / two',
];

/** What it draws with `markdownAlwaysOn`: the plain rows and the code spans are markdown too. */
const ALWAYS_ON = [
  'title [b:bold] [i:ital] / next H2O',
  'section bold [i:ital]',
  'section bold [i:ital]',
  'section a [c:code] b',
  'section bold [i:ital...]',
  'section one...',
  'leaf [b:bold] [i:ital]',
  'leaf [b:bold] [i:ital]',
  'leaf a [c:code] b',
  'leaf [b:bold] [i:ital] / next H2O',
  'leaf one / two',
];

function api(config: InitializeConfig = {}): Mermaid {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m;
}

const own = (tree: SvgView, n: SvgElement): string =>
  tree
    .children(n)
    .map((c) => tree.textOf(c) ?? '')
    .join('');

/**
 * Each drawn label `<text>` (values left out): a bold run as `[b:…]`, an italic run as `[i:…]`,
 * inline code (a `<tspan>` in its own font) as `[c:…]`, and a new line (a `<tspan>` with its own
 * `y`) as ` / `. A section label's bold, which the
 * whole label has, is not marked.
 */
function drawn(svg: string): string[] {
  const tree = parseSvg(svg);
  const out: string[] = [];
  for (const t of tree.find({ tag: 'text' })) {
    if ((tree.getAttr(t, 'class') ?? '').includes('Value')) continue;
    const section = tree.getAttr(t, 'class') === 'treemapSectionLabel';
    const spans = tree.children(t).filter((c) => tree.tag(c) === 'tspan');
    let label = '';
    for (const n of spans.length === 0 ? [t] : spans) {
      if (label !== '' && tree.getAttr(n, 'y') !== undefined) label = label.trimEnd() + ' / ';
      const text = own(tree, n);
      if (n === t) label += text;
      else if (tree.getAttr(n, 'font-weight') === 'bold' && !section) label += `[b:${text}]`;
      else if (tree.getAttr(n, 'font-style') === 'italic') label += `[i:${text}]`;
      else if (tree.getAttr(n, 'font-family') !== undefined) label += `[c:${text}]`;
      else label += text;
    }
    out.push(label.trim());
  }
  return out;
}

describe('treemap label syntax (#1368)', () => {
  it('reads markdown only in a quoted markdown string, in every label kind', async () => {
    const { svg, warnings } = await api().render('m', SOURCE);
    expect(drawn(svg)).toEqual(DEFAULT);
    // Plain `**bold** _ital_` labels of three kinds: one warning per render.
    expect(warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code)).toHaveLength(1);
  });

  it('draws a plain one-line label as one string, as before', async () => {
    const { svg } = await api().render('m', 'treemap-beta\n  "A &amp; B"\n    "leaf": 1\n');
    expect(svg).toContain('dominant-baseline="middle" font-size="12">A &amp; B</text>');
    expect(svg).toContain('>leaf</text>');
  });

  it('gives no warning for markdown strings', async () => {
    const source = 'treemap-beta\n  "`a **b**`"\n    "`c _d_`": 1\n';
    const { warnings } = await api().render('m', source);
    expect(warnings.map((w) => w.code)).not.toContain(MARKDOWN_NOT_READ.code);
  });

  it.each<[string, InitializeConfig, string]>([
    ['the fixture', {}, 'label-syntax-compat'],
    ['global config', { markdownAlwaysOn: true }, 'label-syntax'],
    ['the treemap section', { treemap: { markdownAlwaysOn: true } }, 'label-syntax'],
  ])('reads every label as markdown with markdownAlwaysOn (%s)', async (_, config, name) => {
    const { svg, warnings } = await api(config).render('m', fixture(name));
    expect(drawn(svg)).toEqual(ALWAYS_ON);
    expect(warnings.map((w) => w.code)).not.toContain(MARKDOWN_NOT_READ.code);
  });
});
