/**
 * Spec #1368 T7 (#1395): flowchart reads its labels through core's label handler (#1368),
 * through the public render(). In the default mode markdown is read only in a quoted markdown
 * string, bare backticks are drawn as written, and a plain label holding an emphasis pair gives
 * one `MARKDOWN_NOT_READ` warning per render. With `markdownAlwaysOn` every label is markdown.
 */
import { describe, expect, it } from 'vitest';
import { createMermaid, type InitializeConfig, type RenderResult } from 'mermaid';

async function draw(source: string, config: InitializeConfig = {}): Promise<RenderResult> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  return m.render('mermaid-0', source);
}
const svgOf = async (source: string, config?: InitializeConfig): Promise<string> =>
  (await draw(source, config)).svg;

/** The text of every `<text>`, tags stripped. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((t) => t[1]!.replace(/<[^>]+>/g, ''));

/** Whether a `<text>` whose text is `want` draws bold and italic runs. */
const emphasised = (svg: string, want: string): boolean =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].some(
    (t) =>
      t[1]!.replace(/<[^>]+>/g, '') === want &&
      t[1]!.includes('font-weight="bold"') &&
      t[1]!.includes('font-style="italic"')
  );

const BOLD = /font-weight="bold"/;
const ALWAYS_ON: readonly (readonly [string, InitializeConfig])[] = [
  ['globally', { markdownAlwaysOn: true }],
  ['in the flowchart section', { flowchart: { markdownAlwaysOn: true } } as InitializeConfig],
];

/** Every flowchart label kind, written plain with an emphasis pair. */
const PLAIN_KINDS: readonly (readonly [string, string, string])[] = [
  ['a quoted node', 'flowchart LR\n  A["node **b** _i_"]', 'node b i'],
  ['an unquoted node', 'flowchart LR\n  A(node **b** _i_)', 'node b i'],
  ['an edge between pipes', 'flowchart LR\n  A -->|edge **b** _i_| B', 'edge b i'],
  ['an inline edge', 'flowchart LR\n  A -- edge **b** _i_ --> B', 'edge b i'],
  ['a subgraph title', 'flowchart LR\n  subgraph s [title **b** _i_]\n    A\n  end', 'title b i'],
  [
    'a swimlane lane title',
    'swimlane-beta LR\n  subgraph s [lane **b** _i_]\n    A --> B\n  end',
    'lane b i',
  ],
];

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
    const svg = await svgOf('flowchart LR\n  A["`**one**\\ntwo`"]');
    expect(texts(svg)).toContain('onetwo');
    expect(svg).not.toContain('\\n');
  });
});

describe('flowchart labels with markdownAlwaysOn (#1395)', () => {
  for (const [where, config] of ALWAYS_ON) {
    it.each(PLAIN_KINDS)(
      `reads plain emphasis on %s as markdown, set ${where}`,
      async (_, src, want) => {
        expect(emphasised(await svgOf(src), want)).toBe(false);
        expect(emphasised(await svgOf(src, config), want)).toBe(true);
      }
    );
  }

  it('draws markdown strings, tags and written \\n as in the default mode', async () => {
    const source = [
      'flowchart LR',
      '  A["`**md** _string_`"] -->|"<b>tag</b> <i>it</i><br>H<sub>2</sub>O"| B(one\\ntwo)',
      '  subgraph s ["`**title**`"]',
      '    B',
      '  end',
    ].join('\n');
    expect(await svgOf(source, { markdownAlwaysOn: true })).toBe(await svgOf(source));
  });

  it('writes the text output as it draws', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    const source = 'flowchart LR\n  A[node **b** _i_] -->|edge **e**| B';
    await m.prepare(source, { format: 'ascii' });
    const plain = m.renderSync(source, { format: 'ascii' }).text;
    const md = m.renderSync(source, { format: 'ascii', config: { markdownAlwaysOn: true } }).text;
    expect(plain).toContain('**b**');
    expect(plain).toContain('**e**');
    expect(md).not.toContain('*');
    expect(md).not.toContain('_i_');
    expect(md).toContain('node b i');
  });
});

describe('the MARKDOWN_NOT_READ warning in flowchart (#1395)', () => {
  const notRead = (r: RenderResult): number =>
    r.warnings.filter((w) => w.code === 'MARKDOWN_NOT_READ').length;
  const plain = [
    'flowchart LR',
    '  subgraph s [title **b**]',
    '    A[node **b**] -->|edge _i_| B(node __b__)',
    '  end',
    '  B -- inline *i* --> C',
  ].join('\n');

  it('warns once for plain labels of several kinds', async () => {
    expect(notRead(await draw(plain))).toBe(1);
  });

  it('does not warn with markdownAlwaysOn', async () => {
    expect(notRead(await draw(plain, { markdownAlwaysOn: true }))).toBe(0);
  });

  it('does not warn for markdown strings', async () => {
    const source = 'flowchart LR\n  A["`node **b**`"] -->|"`edge _i_`"| B';
    expect(notRead(await draw(source))).toBe(0);
  });
});
