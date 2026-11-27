/**
 * Treemap labels through the label handler (#1368, #1403), read back from what `render()` draws
 * for `treemap/pr-check/label-syntax.mmd`. Only a quoted markdown string is markdown, in a
 * section or leaf name, whose quotes the parser removes and whose markdown string it marks;
 * plain markers and a code span are drawn as written; tags draw and a written `\n` breaks. A
 * section header is one line high: it keeps a label's first line, with `...` after it. No
 * treemap label kind read markdown in v12, so `legacyMarkdown` changes nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const SOURCE = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/treemap/pr-check/label-syntax.mmd'),
  'utf8'
);

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
 * and a new line (a `<tspan>` with its own `y`) as ` / `. A section label's bold, which the
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
      else label += text;
    }
    out.push(label.trim());
  }
  return out;
}

describe('treemap label syntax (#1368)', () => {
  it('reads markdown only in a quoted markdown string, in every label kind', async () => {
    const { svg } = await api().render('m', SOURCE);
    expect(drawn(svg)).toEqual([
      'title [b:bold] [i:ital] / next H2O',
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
    ]);
  });

  it('draws a plain one-line label as one string, as before', async () => {
    const { svg } = await api().render('m', 'treemap-beta\n  "A &amp; B"\n    "leaf": 1\n');
    expect(svg).toContain('dominant-baseline="middle" font-size="12">A &amp; B</text>');
    expect(svg).toContain('>leaf</text>');
  });

  it('draws the same with legacyMarkdown: no treemap label kind read markdown in v12', async () => {
    const svg = async (config: InitializeConfig): Promise<string> =>
      (await api(config).render('m', SOURCE)).svg;
    expect(await svg({ legacyMarkdown: true })).toBe(await svg({}));
  });
});
