/**
 * #1389 (spec #1368): class labels through the public `render()`. In the default mode markdown
 * outside a markdown string is drawn as written and the render warns once (`MARKDOWN_NOT_READ`);
 * `legacyMarkdown: true` draws it as v12 did, without the warning. A markdown string and a
 * written `\n` read the same in both modes.
 */
import { createMermaid, type InitializeConfig } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { parseSvg, type SvgElement } from '../svg-tree.ts';

/** The text inside `n`, its descendants' included. */
const deep = (n: SvgElement): string => n.text ?? n.children.map(deep).join('');

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
  // Each drawn line starts at a `tspan` with an `x`.
  const texts = tree.find((n) => n.tag === 'tspan' && n.attrs.x !== undefined).map(deep);
  const codes = result.warnings.map((w) => w.code);
  return { texts, codes, svg: result.svg };
}

const notRead = (codes: readonly string[]) => codes.filter((c) => c === 'MARKDOWN_NOT_READ');

describe('class labels through render() (#1389)', () => {
  it('draws plain markdown as written and warns once', async () => {
    const { texts, codes } = await render(REPRO);
    expect(notRead(codes)).toEqual(['MARKDOWN_NOT_READ']);
    expect(texts).toContain('**bold** and `code`');
    expect(texts).toContain('+attribute *italic*');
    // The note breaks at the written `\n` (#1330).
    expect(texts).toContain('A note');
    expect(texts).toContain('with two lines');
    // The namespace title's markdown string is read (#1230).
    expect(texts.join('\n')).not.toContain('**layer**');
  });

  it('draws plain markdown as v12 did with legacyMarkdown, and does not warn', async () => {
    const { texts, codes } = await render(REPRO, { legacyMarkdown: true });
    expect(notRead(codes)).toEqual([]);
    expect(texts.join('\n')).not.toContain('**bold**');
    expect(texts).toContain('with two lines');
  });

  it('reads legacyMarkdown from front matter', async () => {
    const { codes } = await render(`---\nconfig:\n  legacyMarkdown: true\n---\n${REPRO}`);
    expect(notRead(codes)).toEqual([]);
  });

  it('does not warn about markdown strings', async () => {
    const plain = await render(MD_STRINGS);
    expect(notRead(plain.codes)).toEqual([]);
    expect(plain.texts.join('\n')).not.toContain('**');
    const legacy = await render(MD_STRINGS, { legacyMarkdown: true });
    expect(legacy.svg).toBe(plain.svg);
  });
});
