import { describe, expect, it } from 'vitest';
import { createMermaid, type RenderResult } from 'mermaid';

/**
 * Mindmap label syntax through the public `render()` (#1368, ticket #1391): markdown is read in
 * a markdown string only, and plain `**x**` gives one `MARKDOWN_NOT_READ` warning per render.
 * With `markdownAlwaysOn: true`, globally or in the `mindmap` section, every label of every node
 * form is markdown, with no warning. Mindmap has no text output (D216).
 */
const render = async (source: string, config = {}): Promise<RenderResult> => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('mermaid-0', source);
};

const notRead = (r: RenderResult) => r.warnings.filter((w) => w.code === 'MARKDOWN_NOT_READ');

// Every node form: each shape and a line with no shape.
const PLAIN = `mindmap
  root((root **bold** _ital_))
    a[square **bold** _ital_]
    b(round **bold** _ital_)
    c))bang **bold** _ital_((
    d)cloud **bold** _ital_(
    e{{hexagon **bold** _ital_}}
    plain **bold** _ital_
`;
const FORMS = ['root', 'square', 'round', 'bang', 'cloud', 'hexagon', 'plain'];

const STRINGS = `mindmap
  root(("\`root **bold** _ital_\`"))
    a["\`square **bold** _ital_\`"]
    "\`plain **bold** _ital_\`"
`;

/**
 * The drawn text of every node label, in order, with a bold run as `[B:…]`, an italic one as
 * `[I:…]` and a line break as `|`.
 */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*class="mindmap-node-label"[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1]!
      .replace(/<tspan[^>]*font-weight="bold"[^>]*>([^<]*)<\/tspan>/g, '[B:$1]')
      .replace(/<tspan[^>]*font-style="italic"[^>]*>([^<]*)<\/tspan>/g, '[I:$1]')
      .replace(/<\/tspan>\s*<tspan[^>]*\bx="[^"]*"[^>]*>/g, '|')
      .replace(/<[^>]+>/g, '')
  );

const ALWAYS_ON = [{ markdownAlwaysOn: true }, { mindmap: { markdownAlwaysOn: true } }];

describe('mindmap label syntax (#1368)', () => {
  it('draws plain markdown as written and warns once for several such labels', async () => {
    const r = await render(PLAIN);
    expect(notRead(r)).toHaveLength(1);
    expect(texts(r.svg)).toEqual(FORMS.map((f) => `${f} **bold** _ital_`));
  });

  it('draws plain markdown in every node form as markdown with markdownAlwaysOn, without the warning', async () => {
    for (const config of ALWAYS_ON) {
      const r = await render(PLAIN, config);
      expect(notRead(r)).toEqual([]);
      expect(texts(r.svg)).toEqual(FORMS.map((f) => `${f} [B:bold] [I:ital]`));
    }
  });

  it('reads markdown strings as markdown in both modes, without the warning', async () => {
    for (const config of [{}, ...ALWAYS_ON]) {
      const r = await render(STRINGS, config);
      expect(notRead(r)).toEqual([]);
      expect(texts(r.svg)).toEqual(
        ['root', 'square', 'plain'].map((f) => `${f} [B:bold] [I:ital]`)
      );
    }
  });

  it('draws tags and breaks at a written \\n in both modes', async () => {
    const src =
      'mindmap\n  root[one\\ntwo]\n    a["`three\\nfour`"]\n    b[<b>bold</b> <i>ital</i>]\n';
    const results = await Promise.all([{}, ...ALWAYS_ON].map((c) => render(src, c)));
    for (const r of results) {
      expect(r.svg).not.toContain('\\n');
      expect(r.svg).toBe(results[0]!.svg);
    }
    expect(texts(results[0]!.svg)).toEqual(['one|two', 'three|four', '[B:bold] [I:ital]']);
  });
});
