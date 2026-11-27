/**
 * Packet labels through the label handler (D734, #1397), read back from what `render()` draws
 * for `packet/pr-check/label-syntax.mmd`, in SVG and in text. Only a quoted markdown string is
 * markdown, in the title and in a field label, whose quotes the parser removes and whose
 * markdown string it marks; plain markers and a code span are drawn as written; tags draw and a
 * written `\n` breaks. No packet label kind read markdown in v12, so `legacyMarkdown` changes
 * nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const SOURCE = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/packet/pr-check/label-syntax.mmd'),
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
 * Each drawn `<text>` with more than digits in one string: a bold run as `[b:…]`, an italic run
 * as `[i:…]`, and a new line (a `<tspan>` with its own `y`) as ` / `.
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
      else label += text;
    }
    if (!/^\d+$/.test(label)) out.push(label.trim());
  }
  return out;
}

describe('packet label syntax (D734)', () => {
  it('reads markdown only in a quoted markdown string, in every label kind', async () => {
    const { svg } = await api().render('m', SOURCE);
    expect(drawn(svg)).toEqual([
      'field **bold** _ital_',
      'field [b:bold] [i:ital]',
      'field a `code` b',
      'field [b:bold] [i:ital] / next H2O',
      'field one / two',
      'title [b:bold] [i:ital]',
    ]);
  });

  it('writes in text what it draws: no backticks, emphasis dropped', async () => {
    const { text, warnings } = await api().render('m', SOURCE, { format: 'ascii' });
    expect(warnings.map((w) => w.code)).toContain('ASCII_DROPPED');
    expect(text).toContain('field bold ital');
    expect(text).toContain('title bold ital');
    expect(text).toContain('field **bold** _ital_');
    expect(text).not.toContain('`field');
    expect(text).not.toContain('`title');
  });

  it('draws the same with legacyMarkdown: no packet label kind read markdown in v12', async () => {
    const svg = async (config: InitializeConfig): Promise<string> =>
      (await api(config).render('m', SOURCE)).svg;
    expect(await svg({ legacyMarkdown: true })).toBe(await svg({}));
    const text = async (config: InitializeConfig): Promise<string> =>
      (await api(config).render('m', SOURCE, { format: 'ascii' })).text;
    expect(await text({ legacyMarkdown: true })).toBe(await text({}));
  });
});
