import { describe, expect, it } from 'vitest';
import { SHAPE_GROUPS } from './parser/shapes.ts';
import { draw, text } from './ascii/flow.fixtures.ts';

// The flowchart's `ascii` hook (#46, D76, D82, R-ASCII-1, R-ASCII-5), called through the
// `./ascii` entry as a pipeline does, with the table measurer in the context.

const lines = (...rows: string[]): string => rows.join('\n');

describe('directions', () => {
  it('draws TB top to bottom, with a tee where the edge leaves and a head where it arrives', async () => {
    expect(await text('flowchart TB\nA --> B')).toBe(
      lines('┌───┐', '│ A │', '└─┬─┘', '  │', '  │', '  ▼', '┌───┐', '│ B │', '└───┘')
    );
  });

  it('draws BT bottom to top', async () => {
    expect(await text('flowchart BT\nA --> B')).toBe(
      lines('┌───┐', '│ B │', '└───┘', '  ▲', '  │', '  │', '┌─┴─┐', '│ A │', '└───┘')
    );
  });

  it('draws LR and RL across', async () => {
    expect(await text('flowchart LR\nA --> B')).toBe(
      lines('┌───┐      ┌───┐', '│ A ├─────►│ B │', '└───┘      └───┘')
    );
    expect(await text('flowchart RL\nA --> B')).toBe(
      lines('┌───┐      ┌───┐', '│ B │◄─────┤ A │', '└───┘      └───┘')
    );
  });

  it('uses a cell layout it is given, and redoes any other', async () => {
    const src = 'flowchart LR\nA --> B & C';
    expect(await text(src, { cells: true })).toBe(await text(src));
  });
});

describe('edges', () => {
  it('draws every stroke and head', async () => {
    const src = [
      'flowchart LR',
      'A1 --- B1',
      'A2 -.- B2',
      'A3 === B3',
      'A4 --> B4',
      'A5 <-.-> B5',
      'A6 x==x B6',
      'A7 o--o B7',
    ].join('\n');
    const rows = (await text(src)).split('\n').filter((r) => r.includes('A'));
    expect(rows).toEqual([
      '│ A1 ├──────┤ B1 │',
      '│ A2 ├┄┄┄┄┄┄┤ B2 │',
      '│ A3 ┝━━━━━━┥ B3 │',
      '│ A4 ├─────►│ B4 │',
      '│ A5 │◄┄┄┄┄►│ B5 │',
      '│ A6 │✕━━━━✕│ B6 │',
      '│ A7 │●────●│ B7 │',
    ]);
  });

  it('draws nothing for an invisible edge', async () => {
    expect(await text('flowchart LR\nA ~~~ B')).toBe(
      lines('┌───┐      ┌───┐', '│ A │      │ B │', '└───┘      └───┘')
    );
  });

  it('has an ascii form of every stroke and head', async () => {
    const src = 'flowchart LR\nA1 -.-> B1\nA2 ==x B2\nA3 <--> B3';
    const rows = (await text(src, { charset: 'ascii' })).split('\n').filter((r) => r.includes('A'));
    expect(rows).toEqual(['| A1 +.....>| B1 |', '| A2 +=====x| B2 |', '| A3 |<---->| B3 |']);
  });

  it('puts an edge label on its line', async () => {
    expect(await text('flowchart LR\nA -- yes --> B')).toBe(
      lines('┌───┐           ┌───┐', '│ A ├─── yes ──►│ B │', '└───┘           └───┘')
    );
  });
});

describe('subgraphs', () => {
  it('nests frames with the title on the top border; an empty subgraph is an empty frame', async () => {
    const src =
      'flowchart TB\nsubgraph one [One]\n direction LR\n a --> b\nend\nsubgraph e [Empty]\nend';
    expect(await text(src)).toBe(
      lines(
        '┌───── One ─────┐',
        '│               │      ┌ Empty ┐',
        '│ ┌───┐   ┌───┐ │      │       │',
        '│ │ a ├──►│ b │ │      │       │',
        '│ └───┘   └───┘ │      └───────┘',
        '│               │',
        '└───────────────┘'
      )
    );
  });

  it('draws nested subgraphs inside each other, each with its own direction', async () => {
    const src = [
      'flowchart LR',
      'subgraph outer [Outer]',
      ' subgraph inner [Inner]',
      '  direction TB',
      '  x --> y',
      ' end',
      ' z',
      'end',
    ].join('\n');
    const out = await text(src);
    const at = (s: string): [number, number] => {
      const row = out.split('\n').findIndex((r) => r.includes(s));
      return [row, out.split('\n')[row]!.indexOf(s)];
    };
    const [outerRow, outerCol] = at('Outer');
    const [innerRow, innerCol] = at('Inner');
    expect(innerRow).toBeGreaterThan(outerRow);
    expect(innerCol).toBeGreaterThan(outerCol - 4);
    // TB inside: y is below x.
    expect(at('│ y │')[0]).toBeGreaterThan(at('│ x │')[0]);
    expect(at('│ y │')[1]).toBe(at('│ x │')[1]);
  });

  it('starts a group-to-member edge on the frame, with no tee below it', async () => {
    const src = 'flowchart TB\nsubgraph Sub\n In\nend\nSub --> In';
    for (const charset of ['unicode', 'ascii'] as const) {
      const rows = (await text(src, { charset, cells: true })).split('\n');
      const head = charset === 'ascii' ? 'v' : '▼';
      const y = rows.findIndex((r) => r.includes(head));
      const x = rows[y]!.indexOf(head);
      const bar = charset === 'ascii' ? '|' : '│';
      // From the head up to the frame: a plain line, the frame row a junction.
      for (let k = y - 1; k > 0; k--) expect(rows[k]![x], `${charset} row ${k}`).toBe(bar);
      expect(rows[0]![x]).toBe(charset === 'ascii' ? '+' : '┬');
    }
  });

  it('draws a collapsed subgraph as a box with a + marker', async () => {
    const src = 'flowchart LR\nsubgraph c [Box]\n q --> r\nend\nc@{ view: "collapsed" }\nz --> c';
    expect(await text(src)).toBe(
      lines('┌───┐      ┌+────┐', '│ z ├─────►│ Box │', '└───┘      └─────┘')
    );
  });
});

describe('nodes', () => {
  it('keeps a grown box’s label centred (D140)', async () => {
    const rows = (await text('flowchart LR\nA --> B & C & D & E')).split('\n');
    const box = rows.map((r, i) => [r.slice(0, 5), i] as const).filter(([r]) => /^[│┌└]/.test(r));
    const label = box.findIndex(([r]) => r.includes('A'));
    expect(box.length).toBeGreaterThan(3);
    expect(label).toBe(Math.floor((box.length - 1) / 2));
  });

  it('draws the D82 text forms', async () => {
    const src = [
      'flowchart LR',
      'a(round)',
      'b([stadium])',
      'c((circle))',
      'd(-ellipse-)',
      'e{diamond}',
      'f{{hexagon}}',
      'g[[sub]]',
      'h[(cyl)]',
    ].join('\n');
    const out = await text(src);
    expect(out.match(/╭─+╮/g)).toHaveLength(4);
    expect(out).toMatch(/◇ diamond ◇/);
    expect(out).toMatch(/└──◇──┘|└─+◇─+┘/);
    expect(out).toMatch(/< hexagon >/);
    expect(out).toMatch(/║ sub ║/);
    expect(out).toMatch(/╒═+╕/);
  });

  // Every bracket syntax and every `@{ shape }` name: the label row holds the label alone.
  const brackets: [string, string][] = [
    ['A[label]', 'square'],
    ['A(label)', 'round'],
    ['A([label])', 'stadium'],
    ['A[[label]]', 'subroutine'],
    ['A[(label)]', 'cylinder'],
    ['A((label))', 'circle'],
    ['A(((label)))', 'double circle'],
    ['A(-label-)', 'ellipse'],
    ['A>label]', 'odd'],
    ['A{label}', 'diamond'],
    ['A{{label}}', 'hexagon'],
    ['A[/label/]', 'lean right'],
    ['A[\\label\\]', 'lean left'],
    ['A[/label\\]', 'trapezoid'],
    ['A[\\label/]', 'inverted trapezoid'],
    ...SHAPE_GROUPS.map((g): [string, string] => [`A@{ shape: ${g[0]}, label: "label" }`, g[0]!]),
  ];

  it.each(brackets)('draws %s (%s) with no shape delimiter in the label', async (node) => {
    const { text: out } = await draw(`flowchart LR\n${node} --> B`);
    const row = out.split('\n').find((r) => r.includes('label'));
    if (row === undefined) {
      // Shapes without a label (start, stop, fork…) still draw a box.
      expect(out).toMatch(/┌─+┐/);
      return;
    }
    expect(row).toMatch(/^. label .(.*)$/u);
    expect(row.slice(1, 8)).toBe(' label ');
  });
});

describe('warnings', () => {
  it('warns once per dropped feature kind, naming the AST ids', async () => {
    const src = [
      'flowchart LR',
      'A["`**bold** text`"] --> B',
      'B --> C@{ img: "https://example.com/i.png", label: "pic" }',
      'click A "https://example.com"',
      'style A fill:#f00',
      'classDef hot stroke:#f00',
      'class B hot',
      'linkStyle 0 stroke:#0f0',
      'linkStyle default interpolate linear',
      'accTitle: Title',
      'accDescr: Description',
    ].join('\n');
    const { warnings } = await draw(src);
    const dropped = warnings.filter((w) => w.code === 'ASCII_DROPPED');
    expect(dropped.map((w) => [w.feature, w.astIds])).toEqual([
      [
        'style',
        ['n:A', 'n:B', 'e:A>B', 'style:1', 'classDef:1', 'class:1', 'linkStyle:1', 'linkStyle:2'],
      ],
      ['curve', ['e:A>B', 'e:B>C', 'linkStyle:1', 'linkStyle:2']],
      ['image', ['n:C']],
      ['emphasis', ['n:A']],
      ['link', ['n:A', 'click:1']],
      ['accessibility', ['accTitle:1', 'accDescr:1']],
    ]);
    expect(warnings.filter((w) => w.code === 'ASCII_SHAPE')).toEqual([]);
  });

  it('lists the shapes drawn as plain boxes in one warning', async () => {
    const { warnings } = await draw('flowchart LR\nA>odd] --> B[/lean/] --> C>odd2] --> D[box]');
    expect(warnings).toEqual([
      {
        code: 'ASCII_SHAPE',
        shapes: ['odd', 'lean-r'],
        astIds: ['n:A', 'n:B', 'n:C'],
        message: 'Text output draws these shapes as plain boxes: odd, lean-r.',
      },
    ]);
  });

  it('warns about nothing in a plain chart', async () => {
    expect((await draw('flowchart TB\nA[a] --> B(b) -->|x| C{c}')).warnings).toEqual([]);
  });

  it('turns routes the repair router could not free into one warning', async () => {
    // No lane frees an edge end under a box: repair keeps the snapped route and reports it
    // (D78). The engine never puts one there, so the layout is staged: C moves onto A → B's
    // last cell.
    const { warnings } = await draw('flowchart LR\nA --> B\nC', {
      tweak: (layout) => {
        const end = layout.edges.get('L_A_B_0')!.points.at(-1)!;
        const c = layout.nodes.get('C')!;
        layout.nodes.set('C', { ...c, x: end.x, y: end.y });
      },
    });
    const route = warnings.filter((w) => w.code === 'ASCII_ROUTE');
    expect(route.map((w) => w.astIds)).toEqual([['e:A>B']]);
  });
});

describe('text', () => {
  it('puts the front-matter title centred on the first line', async () => {
    expect(await text('---\ntitle: Hello\n---\nflowchart LR\nA --> B')).toBe(
      lines('     Hello', '┌───┐      ┌───┐', '│ A ├─────►│ B │', '└───┘      └───┘')
    );
  });

  it('measures in cells: wide graphemes take two', async () => {
    expect(await text('flowchart LR\nA[中文] --> B')).toBe(
      lines('┌──────┐      ┌───┐', '│ 中文 ├─────►│ B │', '└──────┘      └───┘')
    );
  });

  it('has no trailing spaces and is deterministic', async () => {
    const src = 'flowchart TB\nsubgraph s [S]\nA --> B\nend\nB -- label --> C & D\nC --> A';
    const a = await text(src);
    expect(a).not.toMatch(/ $/m);
    expect(await text(src)).toBe(a);
  });

  it('writes markdown bullets as - in ascii', async () => {
    const out = await text('flowchart LR\nA["`- one\n- two`"]', { charset: 'ascii' });
    expect(out).toContain('| - one |');
    expect(out).not.toMatch(/[^\x20-\x7e\n]/);
  });
});
