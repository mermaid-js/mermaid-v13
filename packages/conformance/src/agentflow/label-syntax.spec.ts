/**
 * Spec #1368, #1396: agentflow reads its labels through core's label handler, through the public
 * render(). By default markdown is read only in a quoted markdown string, bare backticks are
 * drawn as written, and a plain label with an emphasis pair gives one `MARKDOWN_NOT_READ` per
 * render. With `markdownAlwaysOn` every label is markdown and nothing warns.
 */
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { diagramFixture } from '../edge-label-tag-paint.ts';

interface Drawn {
  readonly svg: string;
  readonly codes: readonly string[];
}

async function render(source: string, config: Record<string, unknown> = {}): Promise<Drawn> {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config });
  const { svg, warnings } = await m.render('mermaid-0', source);
  return { svg, codes: warnings.map((w) => w.code) };
}

const svgOf = async (source: string, config?: Record<string, unknown>) =>
  (await render(source, config)).svg;

/** The text of every `<text>`, tags stripped. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((t) => t[1]!.replace(/<[^>]+>/g, ''));

/** The `<tspan>`s drawn bold, and those drawn italic, by their text. */
const styled = (svg: string, attr: RegExp): string[] =>
  [...svg.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)]
    .filter((t) => attr.test(t[1]!))
    .map((t) => t[2]!);
const BOLD = /font-weight="bold"/;
const ITALIC = /font-style="italic"/;

const HEAD = 'agentflow-beta LR\n';
const ALWAYS_ON = { markdownAlwaysOn: true };
const IN_SECTION = { agentflow: { markdownAlwaysOn: true } };

/** One plain `**b** _i_` label of every kind, each naming its kind in the bold run. */
const EVERY_KIND_PLAIN = `${HEAD}  flow f[**flow** _f_]
    a[**node** _a_] -->|**edge** _e_| b
    b -- **inline** _l_ --> c
  end
  connector k[**connector** _k_]
  global
    g[**global** _g_]
  end
  c --> k
`;
const KINDS = ['flow', 'node', 'edge', 'inline', 'connector', 'global'];
const ITALICS = ['f', 'a', 'e', 'l', 'k', 'g'];

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
  ])('reads a quoted markdown string on %s as markdown, with no warning', async (_, source) => {
    const { svg, codes } = await render(source);
    expect(svg).toMatch(BOLD);
    expect(codes).not.toContain(MARKDOWN_NOT_READ.code);
  });

  it('breaks a markdown string at a written \\n', async () => {
    const svg = await svgOf(`${HEAD}  a["\`**one**\\ntwo\`"]`);
    expect(texts(svg)).toContain('onetwo');
    expect(svg).not.toContain('\\n');
  });

  it('draws plain markdown of every label kind as written, with one warning', async () => {
    const { svg, codes } = await render(EVERY_KIND_PLAIN);
    expect(svg).not.toMatch(BOLD);
    for (const kind of KINDS) expect(texts(svg).join('\n')).toContain(`**${kind}**`);
    expect(codes.filter((c) => c === MARKDOWN_NOT_READ.code)).toHaveLength(1);
  });

  it.each([
    ['globally', ALWAYS_ON],
    ['in the agentflow section', IN_SECTION],
  ])('draws plain markdown of every label kind with markdownAlwaysOn %s', async (_, config) => {
    const { svg, codes } = await render(EVERY_KIND_PLAIN, config);
    expect(styled(svg, BOLD).sort()).toEqual([...KINDS].sort());
    expect(styled(svg, ITALIC).sort()).toEqual([...ITALICS].sort());
    expect(codes).not.toContain(MARKDOWN_NOT_READ.code);
  });

  it('reads markdown strings, tags and a written \\n the same with markdownAlwaysOn', async () => {
    const source = `${HEAD}  a["\`**m** _s_\`"] -->|"<b>t</b><br>H<sub>2</sub>O"| b[one\\ntwo]`;
    expect(await svgOf(source, ALWAYS_ON)).toBe(await svgOf(source));
  });

  it('draws text output as the SVG reads the labels', async () => {
    const m = createMermaid();
    const source = `${HEAD}  a[**node** _a_]`;
    expect((await m.render('t', source, { format: 'ascii' })).text).toContain('**node** _a_');
    const on = (await m.render('t', source, { format: 'ascii', config: ALWAYS_ON })).text;
    expect(on).toContain('node a');
    expect(on).not.toContain('**');
  });

  it('draws the compatibility fixture with every plain label as markdown', async () => {
    const compat = await svgOf(diagramFixture('agentflow/pr-check/label-syntax-compat.mmd'));
    const plain = await svgOf(diagramFixture('agentflow/pr-check/label-syntax.mmd'));
    // The plain row's eight labels (flow, two nodes, two edges, shape data, connector, global)
    // draw bold too.
    expect(styled(compat, BOLD).length - styled(plain, BOLD).length).toBe(8);
  });
});

// #1432: a shape-data label is plain unless its value is a markdown string; v12 read it as
// markdown.
describe('agentflow shape-data labels (#1432)', () => {
  const plain = `${HEAD}  a@{ label: "**data** _d_" }\n  b@{ label: "more __b__" }\n  a --> b`;

  it('draws a plain label as written, with one warning', async () => {
    const { svg, codes } = await render(plain);
    expect(svg).not.toMatch(BOLD);
    expect(texts(svg)).toContain('**data** _d_');
    expect(codes.filter((c) => c === MARKDOWN_NOT_READ.code)).toHaveLength(1);
  });

  it.each(['"`**data** _d_`"', "'`**data** _d_`'"])(
    'reads the markdown-string value %s as markdown, with no warning',
    async (value) => {
      const { svg, codes } = await render(`${HEAD}  a@{ label: ${value} }`);
      expect(styled(svg, BOLD)).toEqual(['data']);
      expect(codes).not.toContain(MARKDOWN_NOT_READ.code);
    }
  );

  it('draws a code span as written, the tags, and a written \\n as a break', async () => {
    const source = `${HEAD}  a@{ label: "a \`code\` b" }\n  b@{ label: "<b>tag</b>" }\n  c@{ label: 'one\\ntwo' }`;
    const svg = await svgOf(source);
    expect(texts(svg)).toEqual(expect.arrayContaining(['a `code` b', 'onetwo']));
    expect(styled(svg, BOLD)).toEqual(['tag']);
    expect(svg).not.toContain('\\n');
  });

  it.each([
    ['globally', ALWAYS_ON],
    ['in the agentflow section', IN_SECTION],
  ])('reads a plain label as markdown with markdownAlwaysOn %s', async (_, config) => {
    const { svg, codes } = await render(plain, config);
    expect(styled(svg, BOLD)).toEqual(['data', 'b']);
    expect(codes).not.toContain(MARKDOWN_NOT_READ.code);
  });
});
