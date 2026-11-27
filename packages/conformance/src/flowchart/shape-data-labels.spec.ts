/**
 * Spec #1368, #1432: a label written in shape data (`a@{ label: "…" }`) follows the label rule,
 * through the public render(), in flowchart and swimlane-beta. It is plain text unless its value
 * is a markdown string (`"`…`"`); the tags draw and a written `\n` breaks the line. A plain
 * one holding an emphasis pair gives one `MARKDOWN_NOT_READ` per render. With `markdownAlwaysOn`
 * it is markdown and nothing warns. v12 read every shape-data label as markdown.
 */
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type RenderResult } from 'mermaid';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';

async function draw(source: string, config: InitializeConfig = {}): Promise<RenderResult> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('mermaid-0', source);
}

/** The text of every `<text>`, tags stripped. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((t) => t[1]!.replace(/<[^>]+>/g, ''));

const BOLD = /font-weight="bold"/;
const notRead = (r: RenderResult): number =>
  r.warnings.filter((w) => w.code === MARKDOWN_NOT_READ.code).length;

const HEADS = [
  ['flowchart', 'flowchart LR\n', { flowchart: { markdownAlwaysOn: true } }],
  ['swimlane-beta', 'swimlane-beta LR\n', { swimlane: { markdownAlwaysOn: true } }],
] as const;

describe.each(HEADS)('shape-data labels in %s (#1432)', (_, head, inSection) => {
  const plain = `${head}  a@{ label: "data **b** _i_" }\n  b@{ label: "more __b__" }\n  a --> b`;

  it('draws a plain label as written, with one warning', async () => {
    const r = await draw(plain);
    expect(r.svg).not.toMatch(BOLD);
    expect(texts(r.svg)).toContain('data **b** _i_');
    expect(notRead(r)).toBe(1);
  });

  it('reads a markdown-string value as markdown, with no warning', async () => {
    for (const value of ['"`data **b**`"', "'`data **b**`'"]) {
      const r = await draw(`${head}  a@{ label: ${value} }`);
      expect(r.svg).toMatch(BOLD);
      expect(texts(r.svg)).toContain('data b');
      expect(notRead(r)).toBe(0);
    }
  });

  it('draws a code span and bare backticks inside a plain value as written', async () => {
    const r = await draw(`${head}  a@{ label: "a \`code\` b" }`);
    expect(texts(r.svg)).toContain('a `code` b');
  });

  it('draws the tags and breaks at a written \\n', async () => {
    const tags = (await draw(`${head}  a@{ label: "<b>tag</b> H<sub>2</sub>O" }`)).svg;
    expect(tags).toMatch(BOLD);
    expect(texts(tags)).toContain('tag H2O');
    expect(tags).not.toContain('&lt;');
    const broken = (await draw(`${head}  a@{ label: 'one\\ntwo' }`)).svg;
    expect(broken).not.toContain('\\n');
    // One `<tspan>` per line: the tags-stripped text runs the lines together.
    expect(texts(broken)).toContain('onetwo');
    expect(broken.match(/<tspan\b/g)).toHaveLength(2);
  });

  it.each([
    ['globally', { markdownAlwaysOn: true }],
    ['in the section', inSection as InitializeConfig],
  ])('reads a plain label as markdown with markdownAlwaysOn %s', async (__, config) => {
    const r = await draw(plain, config);
    expect(r.svg).toMatch(BOLD);
    expect(texts(r.svg)).toContain('data b i');
    expect(notRead(r)).toBe(0);
  });

  it('keeps a written labelType', async () => {
    const r = await draw(`${head}  a@{ label: "data **b**", labelType: "markdown" }`);
    expect(r.svg).toMatch(BOLD);
    expect(notRead(r)).toBe(0);
  });
});
