/**
 * Spec #1368 T7 (#1395): flowchart reads its labels through core's label handler (D733, D734),
 * through the public render(). Markdown only in a quoted markdown string; bare backticks are
 * drawn as written; `legacyMarkdown` changes nothing, since v12 read markdown in no flowchart
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

describe('flowchart labels through the label handler (#1395)', () => {
  it.each([
    ['a node', 'flowchart LR\n  A[`**b**`]', '`**b**`'],
    ['an edge', 'flowchart LR\n  A -->|`**e**`| B', '`**e**`'],
    ['a subgraph title', 'flowchart LR\n  subgraph s [`**t**`]\n    A\n  end', '`**t**`'],
  ])('draws bare backticks on %s as written', async (_, source, written) => {
    const svg = await svgOf(source);
    expect(texts(svg)).toContain(written);
    expect(svg).not.toMatch(BOLD);
  });

  it.each([
    ['a node', 'flowchart LR\n  A["`**b**`"]'],
    ['an edge', 'flowchart LR\n  A -->|"`**e**`"| B'],
    ['an inline edge', 'flowchart LR\n  A -- "`**e**`" --> B'],
    ['a subgraph title', 'flowchart LR\n  subgraph s ["`**t**`"]\n    A\n  end'],
  ])('reads a quoted markdown string on %s as markdown', async (_, source) => {
    expect(await svgOf(source)).toMatch(BOLD);
  });

  it('breaks a markdown string at a written \\n', async () => {
    expect(texts(await svgOf('flowchart LR\n  A["`**one**\\ntwo`"]'))).toContain('onetwo');
    expect(await svgOf('flowchart LR\n  A["`**one**\\ntwo`"]')).not.toContain('\\n');
  });

  it('draws the label fixture the same with legacyMarkdown', async () => {
    const source = diagramFixture('flowchart/pr-check/label-syntax.mmd');
    expect(await svgOf(source, true)).toBe(await svgOf(source));
  });

  it('draws the compatibility-mode twin the same as the label fixture', async () => {
    const compat = diagramFixture('flowchart/pr-check/label-syntax-compat.mmd');
    const source = diagramFixture('flowchart/pr-check/label-syntax.mmd');
    expect(await svgOf(compat)).toBe(await svgOf(source));
  });
});
