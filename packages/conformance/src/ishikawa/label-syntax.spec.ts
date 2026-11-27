/**
 * Ishikawa labels through the label handler (#1368, #1400), read back from what `render()`
 * draws for `ishikawa/pr-check/label-syntax.mmd`, in SVG and in text. Only a line that is wholly
 * a quoted markdown string is markdown, in every label kind: the effect, the causes and the
 * sub-causes at any depth. The parser keeps the line as written, so the handler finds the
 * markdown string itself. Plain markers, bare backticks and a code span are drawn as written;
 * tags draw and a written `\n` breaks. No ishikawa label kind read markdown in v12, so
 * `legacyMarkdown` changes nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const SOURCE = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/ishikawa/pr-check/label-syntax.mmd'),
  'utf8'
);
const COMPAT = readFileSync(
  join(REPO_ROOT, 'e2e/diagrams/ishikawa/pr-check/label-syntax-compat.mmd'),
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

describe('ishikawa label syntax (#1368)', () => {
  it('reads markdown only in a line that is wholly a quoted markdown string, in every label kind', async () => {
    const { svg } = await api().render('m', SOURCE);
    expect(drawn(svg)).toEqual([
      'effect [b:bold] [i:ital]',
      'cause **bold** _ital_',
      'sub **bold** _ital_',
      'cause [b:bold] [i:ital]',
      'sub [b:bold] [i:ital]',
      'deep [b:bold] [i:ital]',
      '`cause **bold** _ital_`',
      '`sub **bold** _ital_`',
      'cause a `code` b',
      'sub a `code` b',
      'cause [b:bold] [i:ital] / next H2O',
      'sub [b:bold] [i:ital] / next H2O',
      'cause one / two',
      'sub one / two',
    ]);
  });

  it('writes in text what it draws: no backticks around a markdown string, emphasis dropped', async () => {
    const { text, warnings } = await api().render('m', SOURCE, { format: 'ascii' });
    expect(warnings.map((w) => w.code)).toContain('ASCII_DROPPED');
    expect(text.split('\n')).toEqual([
      '┌──────────────────┐',
      '│ effect bold ital │',
      '└─┬────────────────┘',
      '  ├── cause **bold** _ital_',
      '  │   └── sub **bold** _ital_',
      '  ├── cause bold ital',
      '  │   └── sub bold ital',
      '  │       └── deep bold ital',
      '  ├── `cause **bold** _ital_`',
      '  │   └── `sub **bold** _ital_`',
      '  ├── cause a `code` b',
      '  │   └── sub a `code` b',
      '  ├── cause bold ital next H2O',
      '  │   └── sub bold ital next H2O',
      '  └── cause one two',
      '      └── sub one two',
    ]);
  });

  it('draws the same with legacyMarkdown: no ishikawa label kind read markdown in v12', async () => {
    const svg = async (config: InitializeConfig): Promise<string> =>
      (await api(config).render('m', SOURCE)).svg;
    expect(await svg({ legacyMarkdown: true })).toBe(await svg({}));
    const text = async (config: InitializeConfig): Promise<string> =>
      (await api(config).render('m', SOURCE, { format: 'ascii' })).text;
    expect(await text({ legacyMarkdown: true })).toBe(await text({}));
  });

  it('draws the compatibility-mode twin fixture as the default one', async () => {
    expect((await api().render('m', COMPAT)).svg).toBe((await api().render('m', SOURCE)).svg);
  });
});
