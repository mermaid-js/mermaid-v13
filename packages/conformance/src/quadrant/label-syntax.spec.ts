/**
 * Quadrant labels through the label handler (D734, #1397), read back from what `render()` draws
 * for `quadrant-chart/pr-check/label-syntax.mmd`. Only a quoted markdown string is markdown, in
 * the title too; plain markers, bare backticks and a code span are drawn as written; tags draw
 * and a written `\n` breaks. No quadrant label kind read markdown in v12, so `legacyMarkdown`
 * changes nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig } from 'mermaid';
import { REPO_ROOT } from '../index.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/quadrant-chart/pr-check', name), 'utf8');
const SOURCE = fixture('label-syntax.mmd');

async function render(config: InitializeConfig = {}, source = SOURCE): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return (await m.render('m', source)).svg;
}

const own = (tree: SvgView, n: SvgElement): string =>
  tree
    .children(n)
    .map((c) => tree.textOf(c) ?? '')
    .join('');

/**
 * Each drawn `<text>` in one string: a bold run as `[b:…]`, an italic run as `[i:…]`, and a new
 * line (a `<tspan>` with its own `y`) as ` / `.
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
      else out += text;
    }
    return out.trim();
  });
}

describe('quadrant label syntax (D734)', () => {
  it('reads markdown only in a quoted markdown string, in every label kind', async () => {
    const labels = drawn(await render());
    expect(labels).toEqual(
      expect.arrayContaining([
        // Quoted markdown strings: the title, an axis label, a quadrant and a point.
        'title [b:bold] [i:ital]',
        'x-start [b:bold] [i:ital]',
        'quadrant [b:bold] [i:ital]',
        'point [b:bold] [i:ital]',
        // Drawn as written: plain markers, bare backticks and a code span.
        'x-end **bold** _ital_',
        '`quadrant **bold** _ital_`',
        'quadrant a `code` b',
        'point **bold** _ital_',
        '`point **bold** _ital_`',
        'point a `code` b',
        // Tags draw and `<br>` breaks.
        'y-start [b:bold] [i:ital] / next H2O',
        'quadrant [b:bold] [i:ital] / next H2O',
        'point [b:bold] [i:ital] / next H2O',
        // A written `\n` breaks.
        'y-end one / two',
        'point one / two',
      ])
    );
    expect(labels).toHaveLength(15);
  });

  it('draws the same with legacyMarkdown: no quadrant label kind read markdown in v12', async () => {
    expect(await render({ legacyMarkdown: true })).toBe(await render());
    // The compatibility-mode twin sets the key in its front matter.
    expect(await render({}, fixture('label-syntax-compat.mmd'))).toBe(await render());
  });
});
