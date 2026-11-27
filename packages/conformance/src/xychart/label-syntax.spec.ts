/**
 * XY chart labels through the label handler (#1368, #1400), read back from what `render()`
 * draws for `xychart/pr-check/label-syntax.mmd`. Only a quoted markdown string is markdown, in
 * every label kind: the title, the axis titles, the categories, the plot names (the legend) and
 * the point labels. The parser removes the quotes and marks a markdown string, so the layout
 * reads the text inside its backticks as markdown. Plain markers and a code span are drawn as
 * written; tags draw and a written `\n` breaks.
 * `markdownAlwaysOn` reads every label as markdown: the compat fixture shows it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const SOURCE = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/xychart/pr-check/label-syntax.mmd'),
  'utf8'
);
const COMPAT = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/xychart/pr-check/label-syntax-compat.mmd'),
  'utf8'
);

/** Every label kind as a quoted markdown string. */
const MARKDOWN_STRINGS =
  'xychart\n  title "`**t**`"\n  x-axis "`**x**`" ["`**c**`", b]\n  y-axis "`**y**`" 0 --> 10\n  line "`**p**`" [1 "`**l**`", 2]\n';

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
 * Each drawn `<text>` that is more than a number: a bold run as `[b:…]`, an italic run as
 * `[i:…]`, a monospace run as `[m:…]`, and a new line (a `<tspan>` with its own `y`) as ` / `.
 */
function drawn(svg: string): string[] {
  const tree = parseSvg(svg);
  const out: string[] = [];
  for (const t of tree.find({ tag: 'text' })) {
    const spans = tree.children(t).filter((c) => tree.tag(c) === 'tspan');
    let label = '';
    for (const n of spans.length === 0 ? [t] : spans) {
      if (label !== '' && tree.getAttr(n, 'y') !== undefined) label = label.trimEnd() + ' / ';
      const text = own(tree, n);
      if (n === t) label += text;
      else if (tree.getAttr(n, 'font-weight') === 'bold') label += `[b:${text}]`;
      else if (tree.getAttr(n, 'font-style') === 'italic') label += `[i:${text}]`;
      else if (tree.getAttr(n, 'font-family')?.includes('monospace')) label += `[m:${text}]`;
      else label += text;
    }
    if (!/^[\d.]+$/.test(label)) out.push(label.trim());
  }
  return out;
}

describe('XY chart label syntax (#1368)', () => {
  it('reads markdown only in a quoted markdown string, in every label kind', async () => {
    const { svg } = await api().render('m', SOURCE);
    expect(drawn(svg)).toEqual([
      'title [b:bold] [i:ital]',
      'point **bold** _ital_',
      'point [b:bold] [i:ital]',
      'point a `code` b',
      'point [b:bold] [i:ital] / next H2O',
      'point one / two',
      'plot **bold** _ital_',
      'plot [b:bold] [i:ital]',
      'plot a `code` b',
      'plot [b:bold] [i:ital] / next H2O',
      'plot one / two',
      'cat **bold** _ital_',
      'cat [b:bold] [i:ital]',
      'cat a `code` b',
      'cat [b:bold] [i:ital] / next H2O',
      'cat one / two',
      'x-axis [b:bold] [i:ital]',
      'y-axis [b:bold] [i:ital]',
    ]);
  });

  it('reads every label kind as markdown with markdownAlwaysOn (the compat fixture)', async () => {
    expect(drawn((await api().render('m', COMPAT)).svg)).toEqual([
      'title [b:bold] [i:ital]',
      'point [b:bold] [i:ital]',
      'point [b:bold] [i:ital]',
      'point a [m:code] b',
      'point [b:bold] [i:ital] / next H2O',
      'point one / two',
      'plot [b:bold] [i:ital]',
      'plot [b:bold] [i:ital]',
      'plot a [m:code] b',
      'plot [b:bold] [i:ital] / next H2O',
      'plot one / two',
      'cat [b:bold] [i:ital]',
      'cat [b:bold] [i:ital]',
      'cat a [m:code] b',
      'cat [b:bold] [i:ital] / next H2O',
      'cat one / two',
      'x-axis [b:bold] [i:ital]',
      'y-axis [b:bold] [i:ital]',
    ]);
  });

  it('reads the setting from the xyChart section as from the top level', async () => {
    const plain = COMPAT.replace(/^config:\n {2}markdownAlwaysOn: true\n/m, 'config:\n');
    expect(plain).not.toBe(COMPAT);
    const top = (await api({ markdownAlwaysOn: true }).render('m', plain)).svg;
    expect((await api({ xyChart: { markdownAlwaysOn: true } }).render('m', plain)).svg).toBe(top);
    expect(top).toBe((await api().render('m', COMPAT)).svg);
  });

  it('warns MARKDOWN_NOT_READ once in the default mode, never with markdownAlwaysOn', async () => {
    const codes = async (src: string): Promise<string[]> =>
      (await api().render('m', src)).warnings
        .map((w) => w.code)
        .filter((c) => c === MARKDOWN_NOT_READ.code);
    expect(await codes(SOURCE)).toEqual([MARKDOWN_NOT_READ.code]);
    expect(await codes(COMPAT)).toEqual([]);
    expect(await codes(MARKDOWN_STRINGS)).toEqual([]);
  });
});
