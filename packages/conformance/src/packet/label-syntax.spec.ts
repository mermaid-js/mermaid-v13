/**
 * Packet labels through the label handler (#1368, #1397), read back from what `render()` draws
 * for `packet/pr-check/label-syntax.mmd` and its `markdownAlwaysOn` twin, in SVG and in text. In
 * the default mode only a quoted markdown string is markdown, in the title and in a field label
 * (whose quotes the parser removes and whose markdown string it marks); plain markers and a code
 * span are drawn as written, and the render warns `MARKDOWN_NOT_READ` once. With
 * `markdownAlwaysOn` every label is markdown. Tags draw and a written `\n` breaks in both.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createMermaid, type InitializeConfig, type Mermaid } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/packet/pr-check', name), 'utf8');
const SOURCE = fixture('label-syntax.mmd');
const ALWAYS_ON = fixture('label-syntax-compat.mmd');

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
 * as `[i:…]`, a code run as `[c:…]`, and a new line (a `<tspan>` with its own `y`) as ` / `.
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
      else if (tree.getAttr(n, 'font-family')?.includes('monospace')) label += `[c:${text}]`;
      else label += text;
    }
    if (!/^\d+$/.test(label)) out.push(label.trim());
  }
  return out;
}

const notRead = (warnings: readonly { code: string }[]): number =>
  warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code).length;

describe('packet label syntax', () => {
  it('reads markdown only in a quoted markdown string by default, and warns once', async () => {
    const { svg, warnings } = await api().render('m', SOURCE);
    expect(drawn(svg)).toEqual([
      'field **bold** _ital_',
      'field [b:bold] [i:ital]',
      'field a `code` b',
      'field [b:bold] [i:ital] / next H2O',
      'field one / two',
      'title [b:bold] [i:ital]',
    ]);
    expect(notRead(warnings)).toBe(1);
  });

  it('writes in text what it draws: no backticks, emphasis dropped', async () => {
    const { text, warnings } = await api().render('m', SOURCE, { format: 'ascii' });
    expect(warnings.map((w) => w.code)).toContain('ASCII_DROPPED');
    expect(notRead(warnings)).toBe(1);
    expect(text).toContain('field bold ital');
    expect(text).toContain('title bold ital');
    expect(text).toContain('field **bold** _ital_');
    expect(text).toContain('field a `code` b');
    expect(text).not.toContain('`field');
    expect(text).not.toContain('`title');
  });

  it.each([
    ['set globally', ALWAYS_ON, {}],
    ['set in the packet section', SOURCE, { packet: { markdownAlwaysOn: true } }],
  ] as const)(
    'reads every label as markdown with markdownAlwaysOn %s',
    async (_how, source, config) => {
      const { svg, warnings } = await api(config as InitializeConfig).render('m', source);
      expect(drawn(svg)).toEqual([
        'field [b:bold] [i:ital]',
        'field [b:bold] [i:ital]',
        'field a [c:code] b',
        'field [b:bold] [i:ital] / next H2O',
        'field one / two',
        'title [b:bold] [i:ital]',
      ]);
      expect(notRead(warnings)).toBe(0);
      const ascii = await api(config as InitializeConfig).render('m', source, { format: 'ascii' });
      expect(ascii.text).not.toContain('**');
      expect(ascii.text).toContain('field a code b');
      expect(notRead(ascii.warnings)).toBe(0);
    }
  );

  it('keeps "**b** *i*" literal by default and reads it as markdown with markdownAlwaysOn', async () => {
    const source = 'packet\n0-15: "`**bold**`"\n16-31: "`*italic*`"\n32-47: "**b** *i*"';
    const plain = await api().render('m', source);
    expect(drawn(plain.svg)).toEqual(['[b:bold]', '[i:italic]', '**b** *i*']);
    expect(notRead(plain.warnings)).toBe(1);
    const on = await api({ markdownAlwaysOn: true }).render('m', source);
    expect(drawn(on.svg)).toEqual(['[b:bold]', '[i:italic]', '[b:b] [i:i]']);
    expect(notRead(on.warnings)).toBe(0);
  });

  it('gives no warning when every label is a markdown string', async () => {
    const { warnings } = await api().render('m', 'packet\ntitle "`**t**`"\n0-15: "`**b**`"');
    expect(notRead(warnings)).toBe(0);
  });
});
