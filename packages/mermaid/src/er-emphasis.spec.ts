// ER labels read Markdown emphasis, as v12 does for every ER label (#754, D563).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const fixture = (path: string): string =>
  readFileSync(new URL(`../../../e2e/diagrams/er-diagram/${path}`, import.meta.url), 'utf8');

/** Each `<text>` element as `[its text, the text of its bold runs, of its italic runs]`. */
function drawn(svg: string): [string, string, string][] {
  const styled = (inner: string, attr: string): string =>
    [...inner.matchAll(new RegExp(`<tspan\\b[^>]*${attr}[^>]*>([^<]*)</tspan>`, 'g'))]
      .map((m) => m[1] ?? '')
      .join('|');
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gs)].map((m) => {
    const inner = m[1] ?? '';
    return [
      inner.replace(/<[^>]+>/g, ''),
      styled(inner, 'font-weight="bold"'),
      styled(inner, 'font-style="italic"'),
    ];
  });
}

function mermaid() {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
}

async function svgOf(path: string): Promise<string> {
  const r = await mermaid().render('x', fixture(path));
  expect(r.warnings).toEqual([]);
  return r.svg;
}

describe('Markdown emphasis in ER labels (#754, D563)', () => {
  it('draws bold and italic runs without the markers in every label kind', async () => {
    const texts = drawn(await svgOf('baseline/text/markdown-emphasis.mmd'));
    expect(texts).toEqual(
      expect.arrayContaining([
        ['This is Markdown', 'is', 'Markdown'],
        ['Alias', '', 'Alias'],
        ['bold', 'bold', ''],
        ['it', '', 'it'],
        ['a comment', 'comment', ''],
        ['rel', 'rel', ''],
        ['Sales domain', 'domain', ''],
      ])
    );
  });

  it('keeps an underscore inside a word', async () => {
    const texts = drawn(await svgOf('baseline/text/markdown-emphasis.mmd'));
    expect(texts.filter(([text]) => text === 'order_item')).toEqual([
      ['order_item', '', ''],
      ['order_item', '', ''],
    ]);
  });

  it('text output drops the markers', async () => {
    const { text, warnings } = await mermaid().render(
      'x',
      fixture('baseline/text/markdown-emphasis.mmd'),
      { format: 'ascii' }
    );
    expect(warnings).toEqual([]);
    for (const label of ['This is Markdown', 'Alias', 'bold', 'it', 'a comment', 'rel'])
      expect(text).toContain(label);
    expect(text).toContain('Sales domain');
    expect(text).toContain('order_item');
    expect(text).not.toMatch(/\*|__|_it_|_Markdown_/);
  });

  it('the unicode-text fixture shows no raw markers', async () => {
    const texts = drawn(
      await svgOf('visual-check/an-er-diagram-with-unicode-text-default.mmd')
    ).map(([text]) => text);
    expect(texts).toEqual(
      expect.arrayContaining(['testẽζ➕Ø😀㌕ぼ', 'driversLicense', 'phone', 'age', 'lastName'])
    );
  });
});
