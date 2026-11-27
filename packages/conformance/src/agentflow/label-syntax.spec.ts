/**
 * Spec #1368 T8 (#1396): agentflow reads its labels through core's label handler (D733, D734),
 * through the public render(). Markdown only in a quoted markdown string; bare backticks are
 * drawn as written; `legacyMarkdown` changes nothing, since v12 read markdown in no agentflow
 * label kind without a markdown string.
 */
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { diagramFixture } from '../edge-label-tag-paint.ts';

async function svgOf(source: string, legacyMarkdown = false): Promise<string> {
  const m = createMermaid();
  m.initialize({ deterministic: true, legacyMarkdown });
  return (await m.render('mermaid-0', source)).svg;
}

/** The text of every `<text>`, tags stripped. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((t) => t[1]!.replace(/<[^>]+>/g, ''));

const BOLD = /font-weight="bold"/;
const HEAD = 'agentflow-beta LR\n';

describe('agentflow labels through the label handler (#1396)', () => {
  it.each([
    ['a node', `${HEAD}  a[\`**b**\`]`, '`**b**`'],
    ['an edge', `${HEAD}  a -->|\`**e**\`| b`, '`**e**`'],
    ['a flow title', `${HEAD}  flow f[\`**t**\`]\n    a\n  end`, '`**t**`'],
    ['a connector', `${HEAD}  connector c[\`**c**\`]`, '`**c**`'],
  ])('draws bare backticks on %s as written', async (_, source, written) => {
    const svg = await svgOf(source);
    expect(texts(svg)).toContain(written);
    expect(svg).not.toMatch(BOLD);
  });

  it.each([
    ['a node', `${HEAD}  a["\`**b**\`"]`],
    ['an edge', `${HEAD}  a -->|"\`**e**\`"| b`],
    ['an inline edge', `${HEAD}  a -- "\`**e**\`" --> b`],
    ['a flow title', `${HEAD}  flow f["\`**t**\`"]\n    a\n  end`],
    ['a connector', `${HEAD}  connector c["\`**c**\`"]`],
  ])('reads a quoted markdown string on %s as markdown', async (_, source) => {
    expect(await svgOf(source)).toMatch(BOLD);
  });

  it('breaks a markdown string at a written \\n', async () => {
    const svg = await svgOf(`${HEAD}  a["\`**one**\\ntwo\`"]`);
    expect(texts(svg)).toContain('onetwo');
    expect(svg).not.toContain('\\n');
  });

  it('draws the label fixture the same with legacyMarkdown', async () => {
    const source = diagramFixture('agentflow/pr-check/label-syntax.mmd');
    expect(await svgOf(source, true)).toBe(await svgOf(source));
  });
});
