/**
 * Quadrant labels through the label handler (#1368, #1397), read back from what `render()` draws
 * for `quadrant-chart/pr-check/label-syntax.mmd` and its `markdownAlwaysOn` twin. In the default
 * mode only a quoted markdown string is markdown, in the title too; plain markers, bare backticks
 * and a code span are drawn as written, and the render warns `MARKDOWN_NOT_READ` once. With
 * `markdownAlwaysOn` every label kind is markdown. Tags draw and a written `\n` breaks in both.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createMermaid, type InitializeConfig, type RenderResult } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/quadrant-chart/pr-check', name), 'utf8');
const SOURCE = fixture('label-syntax.mmd');
const ALWAYS_ON = fixture('label-syntax-compat.mmd');

async function render(source: string, config: InitializeConfig = {}): Promise<RenderResult> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('m', source);
}

const own = (tree: SvgView, n: SvgElement): string =>
  tree
    .children(n)
    .map((c) => tree.textOf(c) ?? '')
    .join('');

/**
 * Each drawn `<text>` in one string: a bold run as `[b:…]`, an italic run as `[i:…]`, a code run
 * as `[c:…]`, and a new line (a `<tspan>` with its own `y`) as ` / `.
 */
function drawn(svg: string): string[] {
  const tree = parseSvg(svg);
  return tree.find({ tag: 'text' }).map((t) => {
    const spans = tree.children(t).filter((c) => tree.tag(c) === 'tspan');
    if (spans.length === 0) return own(tree, t);
    let out = '';
    for (const n of spans) {
      if (out !== '' && tree.getAttr(n, 'y') !== undefined) out = out.trimEnd() + ' / ';
      const text = own(tree, n);
      if (tree.getAttr(n, 'font-weight') === 'bold') out += `[b:${text}]`;
      else if (tree.getAttr(n, 'font-style') === 'italic') out += `[i:${text}]`;
      else if (tree.getAttr(n, 'font-family')?.includes('monospace')) out += `[c:${text}]`;
      else out += text;
    }
    return out.trim();
  });
}

const notRead = (r: RenderResult): number =>
  r.warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code).length;

/** What both modes draw alike: markdown strings, tags and written `\n`s. */
const ALIKE = [
  'title [b:bold] [i:ital]',
  'x-start [b:bold] [i:ital]',
  'quadrant [b:bold] [i:ital]',
  'point [b:bold] [i:ital]',
  'y-start [b:bold] [i:ital] / next H2O',
  'quadrant [b:bold] [i:ital] / next H2O',
  'point [b:bold] [i:ital] / next H2O',
  'y-end one / two',
  'point one / two',
];

describe('quadrant label syntax', () => {
  it('reads markdown only in a quoted markdown string by default, and warns once', async () => {
    const result = await render(SOURCE);
    const labels = drawn(result.svg);
    expect(labels).toEqual(
      expect.arrayContaining([
        ...ALIKE,
        // Drawn as written: plain markers (an axis end and a point), bare backticks (a quadrant
        // and a point) and a code span (a quadrant and a point).
        'x-end **bold** _ital_',
        'point **bold** _ital_',
        '`quadrant **bold** _ital_`',
        '`point **bold** _ital_`',
        'quadrant a `code` b',
        'point a `code` b',
      ])
    );
    expect(labels).toHaveLength(15);
    expect(notRead(result)).toBe(1);
  });

  it.each([
    ['set globally', {}],
    ['set in the quadrantChart section', { quadrantChart: { markdownAlwaysOn: true } }],
  ] as const)('reads every label as markdown with markdownAlwaysOn %s', async (_how, config) => {
    const source = Object.keys(config).length === 0 ? ALWAYS_ON : SOURCE;
    const result = await render(source, config as InitializeConfig);
    const labels = drawn(result.svg);
    expect(labels).toEqual(
      expect.arrayContaining([
        ...ALIKE,
        'x-end [b:bold] [i:ital]',
        'point [b:bold] [i:ital]',
        // Bare backticks are a code span around the whole label; a code span is code.
        '[c:quadrant **bold** _ital_]',
        '[c:point **bold** _ital_]',
        'quadrant a [c:code] b',
        'point a [c:code] b',
      ])
    );
    expect(labels).toHaveLength(15);
    expect(notRead(result)).toBe(0);
  });

  it('gives no warning when every label is a markdown string', async () => {
    const result = await render(
      [
        'quadrantChart',
        '  title "`**t**`"',
        '  x-axis "`**l**`" --> "`*r*`"',
        '  quadrant-1 "`**q**`"',
        '  "`**p**`": [0.3, 0.6]',
      ].join('\n')
    );
    expect(notRead(result)).toBe(0);
  });
});
