/**
 * State label handling through the public `createMermaid().render()` (#1368, T2 #1390):
 * markdown is read only in a markdown string, a written `\n` breaks every label, and a render
 * whose plain labels hold markdown that v12 drew says so once (`MARKDOWN_NOT_READ`), unless
 * `legacyMarkdown` draws that markdown as v12 did.
 */
import { describe, expect, it } from 'vitest';
import { createMermaid, type MermaidConfig } from 'mermaid';

const render = async (source: string, config: MermaidConfig = {}) => {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('x', source);
};
const codes = (r: { readonly warnings: readonly { readonly code: string }[] }) =>
  r.warnings.map((w) => w.code).filter((c) => c === 'MARKDOWN_NOT_READ');

/** Plain markdown in each of the four label kinds where v12 read it. */
const PLAIN = `stateDiagram-v2
state "text **b**" as T
D: desc _i_
T --> D: tr **b** and *i*
note right of T: note **b**
`;
/** The same labels, each a markdown string. */
const STRINGS = `stateDiagram-v2
state "\`text **b**\`" as T
D: "\`desc _i_\`"
T --> D: "\`tr **b** and *i*\`"
note right of T: "\`note **b**\`"
`;

describe('state render: labels (#1368)', () => {
  it('warns once for a diagram with several plain labels holding markdown', async () => {
    expect(codes(await render(PLAIN))).toEqual(['MARKDOWN_NOT_READ']);
  });

  it('does not warn with legacyMarkdown', async () => {
    expect(codes(await render(PLAIN, { legacyMarkdown: true }))).toEqual([]);
  });

  it('does not warn when the labels are markdown strings', async () => {
    expect(codes(await render(STRINGS))).toEqual([]);
  });

  it('does not warn for markdown in a composite title, which v12 drew as written', async () => {
    const r = await render('stateDiagram-v2\nstate "comp **b**" as C {\n  X\n}');
    expect(codes(r)).toEqual([]);
  });

  it('draws plain markdown as written, and a markdown string as markdown', async () => {
    const plain = await render(PLAIN);
    expect(plain.svg).toContain('tr **b** and *i*');
    const strings = await render(STRINGS);
    expect(strings.svg).not.toContain('**');
    expect(strings.svg).not.toContain('`');
    expect(strings.svg).toMatch(/font-weight="bold"[^>]*>b</);
  });

  it('draws plain markdown as emphasis with legacyMarkdown', async () => {
    const r = await render(PLAIN, { legacyMarkdown: true });
    expect(r.svg).not.toContain('**');
  });

  it('breaks a transition label at a written \\n', async () => {
    const r = await render('stateDiagram-v2\nS1 --> S4: long line using \\nshould work');
    expect(r.svg).not.toContain('\\n');
    expect(r.svg).toContain('>long line using<');
    expect(r.svg).toContain('>should work<');
  });
});
