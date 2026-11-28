/**
 * #1389 (spec #1368): class labels through the public `render()`. In the default mode markdown
 * outside a markdown string is drawn as written and the render warns once (`MARKDOWN_NOT_READ`);
 * `markdownAlwaysOn: true` reads every label as markdown, without the warning. A markdown
 * string, tags and a written `\n` read the same in both modes.
 */
import { createMermaid, type InitializeConfig } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { parseSvg, type SvgElement } from '../svg-tree.ts';

/** The text inside `n`, its descendants' included, bold runs in `<b>` and italic in `<i>`. */
const deep = (n: SvgElement): string => {
  if (n.text !== undefined) return n.text;
  let out = n.children.map(deep).join('');
  if (n.attrs['font-style'] === 'italic') out = `<i>${out}</i>`;
  if (n.attrs['font-weight'] === 'bold') out = `<b>${out}</b>`;
  return out;
};

/** The lines of a `<text>`: each starts at a `tspan` with a `y`, its runs follow it. */
function lines(text: SvgElement): string[] {
  const out: string[] = [];
  for (const run of text.children) {
    if (run.attrs.y !== undefined || out.length === 0) out.push('');
    out[out.length - 1] += deep(run);
  }
  return out;
}

// #1230's repro (Ashish), with the #1330 note.
const REPRO = `classDiagram
  class A["**bold** and \`code\`"]
  A --> B : **bold** and \`code\`
  class M {
    +attribute *italic**
    ~attribute **bold***
  }
  namespace Edge["\`Edge **layer**\`"] {
    class C
  }
  note for A "A note\\nwith two lines"
`;

// Every label kind, written as plain markdown.
const PLAIN = `classDiagram
  namespace N["ns **b** _i_"] {
    class A["cls _i_"] {
      +mem **b** _i_
      +met **b** _i_()
    }
  }
  A "**b**" --> "_i_" C : rel **b** _i_
  note for A "note **b** _i_"
`;

const MD_STRINGS = `classDiagram
  class A["\`**bold** and code\`"]
  A --> B : "\`**bold** and code\`"
  class M {
    +"\`attribute *italic*\`"
  }
  note for A "\`**note**\`"
`;

async function render(source: string, config: Record<string, unknown> = {}) {
  const m = createMermaid();
  m.initialize({ deterministic: true, ...config } as InitializeConfig);
  const result = await m.render('labels1389', source);
  const tree = parseSvg(result.svg);
  const texts = tree.find({ tag: 'text' }).flatMap(lines);
  const codes = result.warnings.map((w) => w.code);
  return { texts, codes, svg: result.svg };
}

const notRead = (codes: readonly string[]) => codes.filter((c) => c === 'MARKDOWN_NOT_READ');

describe('class labels through render() (#1389)', () => {
  it('draws plain markdown as written and warns once', async () => {
    const { texts, codes } = await render(REPRO);
    expect(notRead(codes)).toEqual(['MARKDOWN_NOT_READ']);
    expect(texts).toContain('<b>**bold** and `code`</b>');
    expect(texts).toContain('<i>+attribute *italic*</i>');
    // The note breaks at the written `\n` (#1330).
    expect(texts).toContain('A note');
    expect(texts).toContain('with two lines');
    // The namespace title's markdown string is read (#1230).
    expect(texts).toContain('Edge <b>layer</b>');
  });

  it('warns once for plain markdown in every label kind', async () => {
    const { texts, codes } = await render(PLAIN);
    expect(notRead(codes)).toEqual(['MARKDOWN_NOT_READ']);
    for (const text of ['ns **b** _i_', '+mem **b** _i_', 'rel **b** _i_', 'note **b** _i_'])
      expect(texts).toContain(text);
  });

  it.each([
    ['globally', { markdownAlwaysOn: true }],
    ['through the class section', { class: { markdownAlwaysOn: true } }],
  ])('reads every label kind as markdown with markdownAlwaysOn set %s', async (_, config) => {
    const { texts, codes } = await render(PLAIN, config);
    expect(notRead(codes)).toEqual([]);
    expect(texts).toEqual(
      expect.arrayContaining([
        'ns <b>b</b> <i>i</i>',
        '<b>cls </b><b><i>i</i></b>',
        '+mem <b>b</b> <i>i</i>',
        '+met <b>b</b> <i>i</i>()',
        'rel <b>b</b> <i>i</i>',
        '<b>b</b>',
        '<i>i</i>',
        'note <b>b</b> <i>i</i>',
      ])
    );
    expect(texts.join('\n')).not.toMatch(/\*\*|_i_/);
  });

  it('reads markdownAlwaysOn from front matter', async () => {
    const { codes } = await render(`---\nconfig:\n  markdownAlwaysOn: true\n---\n${REPRO}`);
    expect(notRead(codes)).toEqual([]);
  });

  it('reads markdown strings, tags and \\n the same in both modes, without a warning', async () => {
    const source = `${MD_STRINGS}  note for M "tag <b>b</b><br>one\\ntwo"\n`;
    const plain = await render(source);
    expect(notRead(plain.codes)).toEqual([]);
    expect(plain.texts.join('\n')).not.toContain('**');
    expect(plain.texts).toEqual(expect.arrayContaining(['tag <b>b</b>', 'one', 'two']));
    const always = await render(source, { markdownAlwaysOn: true });
    expect(always.texts).toEqual(plain.texts);
  });
});
