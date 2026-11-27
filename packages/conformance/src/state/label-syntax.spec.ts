/**
 * State label handling through the public `createMermaid().render()` (#1368, T2 #1390):
 * markdown is read only in a markdown string, a written `\n` breaks every label, and a render
 * whose plain labels hold markdown says so once (`MARKDOWN_NOT_READ`). With `markdownAlwaysOn`
 * every label is markdown and nothing warns.
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

/** Plain markdown in every label kind. */
const PLAIN = `stateDiagram-v2
state "text **b** _i_" as T
D: desc **b** _i_
R: rows title **b** _i_
R: row **b** _i_
T --> D: tr **b** _i_
note right of T: note **b** _i_
state "comp **b** _i_" as C {
  X
}
`;
/** The same labels, each a markdown string. */
const STRINGS = `stateDiagram-v2
state "\`text **b** _i_\`" as T
D: "\`desc **b** _i_\`"
R: "\`rows title **b** _i_\`"
R: "\`row **b** _i_\`"
T --> D: "\`tr **b** _i_\`"
note right of T: "\`note **b** _i_\`"
state "\`comp **b** _i_\`" as C {
  X
}
`;
const KINDS = ['text', 'desc', 'rows title', 'row', 'tr', 'note', 'comp'];

/** Each label kind's text as drawn: whether its `b` is bold and its `i` italic. */
const emphasis = (svg: string) =>
  KINDS.map((k) => {
    const at = svg.indexOf(`>${k} </tspan>`);
    const run = at < 0 ? '' : svg.slice(at, svg.indexOf('</text>', at));
    return [
      k,
      run.includes('<tspan font-weight="bold">b</tspan>'),
      run.includes('<tspan font-style="italic">i</tspan>'),
    ];
  });

describe('state render: labels (#1368)', () => {
  it('warns once for a diagram with plain markdown in several label kinds', async () => {
    expect(codes(await render(PLAIN))).toEqual(['MARKDOWN_NOT_READ']);
  });

  it('does not warn with markdownAlwaysOn, set globally or for state', async () => {
    expect(codes(await render(PLAIN, { markdownAlwaysOn: true }))).toEqual([]);
    expect(codes(await render(PLAIN, { state: { markdownAlwaysOn: true } }))).toEqual([]);
  });

  it('does not warn when the labels are markdown strings', async () => {
    expect(codes(await render(STRINGS))).toEqual([]);
  });

  it('draws plain markdown as written, and a markdown string as markdown', async () => {
    const plain = await render(PLAIN);
    for (const k of KINDS) expect(plain.svg).toContain(`${k} **b** _i_`);
    const strings = await render(STRINGS);
    expect(strings.svg).not.toContain('**');
    expect(strings.svg).not.toContain('`');
    expect(emphasis(strings.svg)).toEqual(KINDS.map((k) => [k, true, true]));
  });

  it.each([
    ['globally', { markdownAlwaysOn: true }],
    ['for state', { state: { markdownAlwaysOn: true } }],
  ] as const)(
    'draws plain markdown as markdown in every label kind with markdownAlwaysOn set %s',
    async (_, config) => {
      const r = await render(PLAIN, config as MermaidConfig);
      expect(r.svg).not.toContain('**');
      expect(emphasis(r.svg)).toEqual(KINDS.map((k) => [k, true, true]));
      // A markdown string draws as without the key.
      expect((await render(STRINGS, config as MermaidConfig)).svg).toBe(
        (await render(STRINGS)).svg
      );
    }
  );

  it('breaks a transition label at a written \\n, with or without markdownAlwaysOn', async () => {
    const src = 'stateDiagram-v2\nS1 --> S4: long line using \\nshould work';
    for (const config of [{}, { markdownAlwaysOn: true }]) {
      const r = await render(src, config);
      expect(r.svg).not.toContain('\\n');
      expect(r.svg).toContain('>long line using<');
      expect(r.svg).toContain('>should work<');
    }
  });
});
