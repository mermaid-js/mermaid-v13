import { describe, expect, it } from 'vitest';
import { createMermaid, type RenderResult } from 'mermaid';

/**
 * Mindmap label syntax through the public `render()` (#1368, ticket #1391): markdown is read in
 * a markdown string only, and plain `**x**` gives one `MARKDOWN_NOT_READ` warning per render.
 * With `legacyMarkdown: true` every node form reads plain markdown as v12 did, with no warning.
 */
const render = async (source: string, config = {}): Promise<RenderResult> => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('mermaid-0', source);
};

const notRead = (r: RenderResult) => r.warnings.filter((w) => w.code === 'MARKDOWN_NOT_READ');

const PLAIN = `mindmap
  root((root **bold**))
    a[square _ital_]
    b(round **bold**)
    plain **bold** _ital_
`;

const STRINGS = `mindmap
  root(("\`root **bold**\`"))
    a["\`square _ital_\`"]
    "\`plain **bold**\`"
`;

/** The drawn text of every node label, in order. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*class="mindmap-node-label"[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    m[1]!.replace(/<[^>]+>/g, '')
  );

describe('mindmap label syntax (#1368)', () => {
  it('draws plain markdown as written and warns once for several such labels', async () => {
    const r = await render(PLAIN);
    expect(notRead(r)).toHaveLength(1);
    expect(texts(r.svg)).toEqual([
      'root **bold**',
      'square _ital_',
      'round **bold**',
      'plain **bold** _ital_',
    ]);
  });

  it('draws plain markdown as emphasis with legacyMarkdown, without the warning', async () => {
    const r = await render(PLAIN, { legacyMarkdown: true });
    expect(notRead(r)).toEqual([]);
    expect(texts(r.svg)).toEqual(['root bold', 'square ital', 'round bold', 'plain bold ital']);
    expect(r.svg).toContain('font-weight="bold"');
  });

  it('reads markdown strings as markdown in every node form, without the warning', async () => {
    for (const config of [{}, { legacyMarkdown: true }]) {
      const r = await render(STRINGS, config);
      expect(notRead(r)).toEqual([]);
      expect(texts(r.svg)).toEqual(['root bold', 'square ital', 'plain bold']);
    }
  });

  it('breaks at a written \\n', async () => {
    const r = await render('mindmap\n  root[one\\ntwo]\n    a["`three\\nfour`"]\n');
    expect(texts(r.svg)).toEqual(['onetwo', 'threefour']);
    expect(r.svg).not.toContain('\\n');
  });
});
