// How each label kind of a class diagram is read (#1368, #1389): markdown only in a markdown
// string, tags and a written `\n` everywhere; `markdownAlwaysOn` reads every label as markdown.
import type { DiagramPlugin } from '@mermaid-js/core';
import { describe, expect, it } from 'vitest';
import { Style, tableMeasurer, type MeasuredLabel } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { parseClass } from '../index.ts';
import { layoutClass, type ClassLayout } from './index.ts';
import { classDiagram as diagramPlugin } from '../plugin.ts';

const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;
let theme: Theme | undefined;

const DEFAULT = {};
const ALWAYS = { markdownAlwaysOn: true };

async function lay(src: string, config: Record<string, unknown>): Promise<ClassLayout> {
  theme ??= createTheme(await loadTheme('default'), { diagram: diagramTheme });
  const parse = parseClass(`classDiagram\n${src}`);
  expect(parse.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return layoutClass(parse.model, {
    config: config as ResolvedConfig,
    measurer: tableMeasurer,
    theme,
  });
}

/** `[text, style]` per run, per line. */
const runs = (label: MeasuredLabel | undefined): [string, number][][] =>
  (label?.lines ?? []).map((line) => line.map((r): [string, number] => [r.text, r.style]));

const B = Style.Bold;
const I = Style.Italic;

/** The label of each kind in `src`, as laid out with `config`. */
async function labels(src: string, config: Record<string, unknown>) {
  const out = (await lay(src, config)).class!;
  const box = out.boxes[0]!;
  return {
    name: runs(box.name.label),
    member: runs(box.compartments[0]?.rows[0]?.label),
    method: runs(box.compartments[1]?.rows[0]?.label),
    relation: runs(out.edges.find((e) => e.kind === 'relation')?.label),
    note: runs(out.notes[0]?.label),
    namespace: runs(out.groups[0]?.label),
  };
}

const PLAIN = `namespace N["ns **b** _i_"] {
  class A["cls **b** _i_"] {
    +mem **b** _i_
    +met **b** _i_()
  }
}
A --> C : rel **b** _i_
note for A "note **b** _i_"`;

const MD = `namespace N["\`ns **b** _i_\`"] {
  class A["\`cls **b** _i_\`"] {
    +"\`mem **b** _i_\`"
    +"\`met **b** _i_\`"()
  }
}
A --> C : "\`rel **b** _i_\`"
note for A "\`note **b** _i_\`"`;

describe('class labels, default mode (#1389)', () => {
  it('draws plain markdown as written in every kind', async () => {
    expect(await labels(PLAIN, DEFAULT)).toEqual({
      name: [[['cls **b** _i_', B]]],
      member: [[['+mem **b** _i_', 0]]],
      method: [[['+met **b** _i_()', 0]]],
      relation: [[['rel **b** _i_', 0]]],
      note: [[['note **b** _i_', 0]]],
      namespace: [[['ns **b** _i_', 0]]],
    });
  });

  it('reads a markdown string in every kind, the namespace title included', async () => {
    const read = await labels(MD, DEFAULT);
    expect(read).toEqual({
      // The name is bold already: only the italic shows.
      name: [
        [
          ['cls b ', B],
          ['i', B | I],
        ],
      ],
      // A member wholly a markdown string: the emphasis covers only the marked words.
      member: [
        [
          ['+mem ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
      // A method's markdown string is only part of its text (`()` follows): drawn as written.
      method: [[['+"`met **b** _i_`"()', 0]]],
      relation: [
        [
          ['rel ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
      note: [
        [
          ['note ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
      namespace: [
        [
          ['ns ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
    });
    // With markdownAlwaysOn the same, but for the method: all of its text is markdown, so its
    // backticks are a code span.
    const always = await labels(MD, ALWAYS);
    expect({ ...always, method: read.method }).toEqual(read);
    expect(always.method).toEqual([
      [
        ['+"', 0],
        ['met **b** _i_', Style.Mono],
        ['"()', 0],
      ],
    ]);
  });

  it('draws a code span in plain text, and a member visibility, as written', async () => {
    const read = await labels('class A {\n  -a `code` b\n}\nA --> C : r `code` s', DEFAULT);
    expect(read.member).toEqual([[['-a `code` b', 0]]]);
    expect(read.relation).toEqual([[['r `code` s', 0]]]);
  });

  it('breaks a written \\n in every kind', async () => {
    const read = await labels(
      `namespace N["ns one\\ntwo"] {
  class A["cls one\\ntwo"] {
    +mem one\\ntwo
  }
}
A --> C : rel one\\ntwo
note for A "A note\\nwith two lines"`,
      DEFAULT
    );
    expect(read.name).toEqual([[['cls one', B]], [['two', B]]]);
    expect(read.member).toEqual([[['+mem one', 0]], [['two', 0]]]);
    expect(read.relation).toEqual([[['rel one', 0]], [['two', 0]]]);
    expect(read.note).toEqual([[['A note', 0]], [['with two lines', 0]]]);
    expect(read.namespace).toEqual([[['ns one', 0]], [['two', 0]]]);
  });

  it('breaks a written \\n in a markdown string', async () => {
    const read = await labels('class A\nnote for A "`**one**\\ntwo`"', DEFAULT);
    expect(read.note).toEqual([[['one', B]], [['two', 0]]]);
  });

  it('does not break a \\n in math', async () => {
    const read = await labels('class A["$$x \\neq y$$"]', DEFAULT);
    expect(read.name).toHaveLength(1);
  });

  it('draws tags in members', async () => {
    const read = await labels('class A {\n  +a <b>b</b> H<sub>2</sub>O\n}', DEFAULT);
    expect(read.member).toEqual([
      [
        ['+a ', 0],
        ['b', B],
        [' H', 0],
        ['2', Style.Sub],
        ['O', 0],
      ],
    ]);
  });

  it('draws a backtick class name as the name', async () => {
    const read = await labels('class `Order Service`', DEFAULT);
    expect(read.name).toEqual([[['Order Service', B]]]);
  });
});

describe('class labels, markdownAlwaysOn (#1389)', () => {
  it('reads plain markdown in every label kind', async () => {
    expect(await labels(PLAIN, ALWAYS)).toEqual({
      // The name is bold already: only the italic shows.
      name: [
        [
          ['cls b ', B],
          ['i', B | I],
        ],
      ],
      member: [
        [
          ['+mem ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
      method: [
        [
          ['+met ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
          ['()', 0],
        ],
      ],
      relation: [
        [
          ['rel ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
      note: [
        [
          ['note ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
      namespace: [
        [
          ['ns ', 0],
          ['b', B],
          [' ', 0],
          ['i', I],
        ],
      ],
    });
  });

  it('reads a code span, a multiplicity and an interface name as markdown', async () => {
    const out = (
      await lay('class A {\n  -a `code` b\n}\nA "*one*" --> "_many_" C\nI ()-- A', ALWAYS)
    ).class!;
    expect(runs(out.boxes[0]!.compartments[0]!.rows[0]!.label)).toEqual([
      [
        ['-a ', 0],
        ['code', Style.Mono],
        [' b', 0],
      ],
    ]);
    const rel = out.edges.find((e) => e.kind === 'relation')!;
    expect([runs(rel.startLabel), runs(rel.endLabel)]).toEqual([[[['one', I]]], [[['many', I]]]]);
    expect(out.interfaces.map((i) => runs(i.label))).toEqual([[[['I', 0]]]]);
  });

  it('breaks a written \\n as in the default mode', async () => {
    const read = await labels('class A\nnote for A "A note\\nwith two lines"', ALWAYS);
    expect(read.note).toEqual([[['A note', 0]], [['with two lines', 0]]]);
  });
});

describe('the parser marks markdown strings it unquotes (#1389)', () => {
  it('marks class labels, namespace titles and notes, and keeps their backticks', () => {
    const { model } = parseClass(`classDiagram
namespace N["\`ns\`"] {
  class A["\`a\`"]
}
class B["b \`c\`"]
note for A "\`n\`"
note "n \`c\`"`);
    expect(model.classes.map((c) => [c.label, c.markdown])).toEqual([
      ['`a`', true],
      ['b `c`', undefined],
    ]);
    expect(model.namespaces.map((n) => [n.label, n.markdown])).toEqual([['`ns`', true]]);
    expect(model.notes.map((n) => [n.text, n.markdown])).toEqual([
      ['`n`', true],
      ['n `c`', undefined],
    ]);
  });

  it('unmarks a class label set again without one', () => {
    const { model } = parseClass('classDiagram\nclass A["`a`"]\nclass A["a"]');
    expect(model.classes[0]!.markdown).toBeUndefined();
  });
});
