import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createMermaid } from 'mermaid';

/**
 * Requirement labels through the public API (#1368): markdown is read only in a markdown
 * string, a written `\n` breaks the line, and markdown written outside a markdown string gives
 * one `MARKDOWN_NOT_READ` warning per render. With `markdownAlwaysOn`, set globally or in the
 * `requirement` section, every label is markdown and nothing warns.
 */
function api(): ReturnType<typeof createMermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
}

const PLAIN = `requirementDiagram
requirement "**strong** name" {
  id: 1
  text: "**bold** _ital_"
}
element "_e_" {
  type: "**type**"
  docref: "**doc**"
}
"_e_" - satisfies -> "**strong** name"
`;

const MARKDOWN = `requirementDiagram
requirement "\`**strong** name\`" {
  id: 1
  text: "\`**bold** _ital_\`"
}
element "\`_e_\`" {
  type: "\`**type**\`"
  docref: "\`**doc**\`"
}
"\`_e_\`" - satisfies -> "\`**strong** name\`"
`;

/** The drawn text of each `<text>` element, its tspans joined. */
const drawn = (svg: string): string =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1]!.replace(/<[^>]*>/g, ''))
    .join('\n');

const notRead = (warnings: readonly Warning[]) =>
  warnings.filter((w) => w.code === 'MARKDOWN_NOT_READ');

describe('requirement labels (#1368)', () => {
  it('draws plain markdown as written, with one MARKDOWN_NOT_READ warning per render', async () => {
    const r = await api().render('r', PLAIN);
    expect(drawn(r.svg)).toContain('**strong** name');
    expect(drawn(r.svg)).toContain('Text: **bold** _ital_');
    expect(notRead(r.warnings)).toHaveLength(1);
    expect(notRead(r.warnings)[0]).toMatchObject(MARKDOWN_NOT_READ);
  });

  it('with markdownAlwaysOn, globally or for requirement, reads every label kind as markdown', async () => {
    const markdown = await api().render('r', MARKDOWN);
    for (const config of [
      { markdownAlwaysOn: true },
      { requirement: { markdownAlwaysOn: true } },
    ]) {
      const r = await api().render('r', PLAIN, { config });
      expect(notRead(r.warnings)).toEqual([]);
      expect(drawn(r.svg)).not.toContain('**');
      expect(drawn(r.svg)).not.toContain('_');
      // Every name and value draws as its markdown string does.
      expect(drawn(r.svg)).toEqual(drawn(markdown.svg));
      expect(r.svg.match(/font-weight="bold"/g)).toEqual(markdown.svg.match(/font-weight="bold"/g));
      expect(r.svg.match(/font-style="italic"/g)).toEqual(
        markdown.svg.match(/font-style="italic"/g)
      );
      const text = await api().render('r', PLAIN, { config, format: 'ascii' });
      expect(text.text).toContain('strong name');
      expect(text.text).not.toContain('**');
    }
  });

  it('reads markdown strings as markdown, with no warning, in both modes', async () => {
    for (const config of [{}, { markdownAlwaysOn: true }]) {
      const r = await api().render('r', MARKDOWN, { config });
      expect(notRead(r.warnings)).toEqual([]);
      expect(drawn(r.svg)).not.toContain('`');
      expect(drawn(r.svg)).not.toContain('**');
      expect(r.svg).toContain('font-weight="bold"');
      expect(r.svg).toContain('font-style="italic"');
    }
  });

  it('breaks a written \\n in a name and a text, in both modes', async () => {
    const src = 'requirementDiagram\nrequirement "one\\ntwo" {\n  text: three\\nfour\n}\n';
    for (const config of [{}, { markdownAlwaysOn: true }]) {
      const r = await api().render('r', src, { config });
      expect(drawn(r.svg)).not.toContain('\\n');
      for (const t of ['>one<', '>two<', '>Text: three<', '>four<']) expect(r.svg).toContain(t);
    }
  });

  it('text output draws what the SVG draws and gives the same warning', async () => {
    const dropped = (w: readonly Warning[]) =>
      w.some((x) => x.code === 'ASCII_DROPPED' && x.message.includes('bold and italic'));
    const plain = await api().render('r', PLAIN, { format: 'ascii' });
    expect(plain.text).toContain('**strong** name');
    expect(notRead(plain.warnings)).toHaveLength(1);
    expect(dropped(plain.warnings)).toBe(false);
    const md = await api().render('r', MARKDOWN, { format: 'ascii' });
    expect(md.text).not.toContain('`');
    expect(md.text).toContain('strong name');
    expect(notRead(md.warnings)).toEqual([]);
    expect(dropped(md.warnings)).toBe(true);
  });
});
