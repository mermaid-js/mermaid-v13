import { describe, expect, it } from 'vitest';
import { block, draw, text } from './ascii/block.fixtures.ts';

// Block's `ascii` hook (#559, D449, D320, R-ASCII-5, R-ASCII-6), through the `./ascii` entry:
// boxes on a character grid, one cell width per column at the widest label; composites as
// frames; spaces blank; labels cut with `…`; block arrows as boxes with an arrowhead per pointing
// side; edges as stepped lines with arrowheads; `block.padding` ignored with no warning.

const lines = (...rows: string[]): string => rows.join('\n');

describe('the grid (D449)', () => {
  it('gives every column the width of the widest label', () => {
    expect(text(block('columns 3', 'a bbb c'))).toBe(
      lines(
        '┌─────┐    ┌─────┐    ┌─────┐',
        '│  a  │    │ bbb │    │  c  │',
        '└─────┘    └─────┘    └─────┘'
      )
    );
  });

  it('spans columns and the gaps between them, and wraps rows at `columns`', () => {
    expect(text(block('columns 3', 'a:2 b', 'c d e'))).toBe(
      lines(
        '┌────────────┐    ┌───┐',
        '│     a      │    │ b │',
        '└────────────┘    └───┘',
        '',
        '',
        '┌───┐    ┌───┐    ┌───┐',
        '│ c │    │ d │    │ e │',
        '└───┘    └───┘    └───┘'
      )
    );
  });

  it('leaves a space blank, its cell kept', () => {
    expect(text(block('columns 3', 'a space b'))).toBe(
      lines('┌───┐             ┌───┐', '│ a │             │ b │', '└───┘             └───┘')
    );
  });

  it('draws a composite as a frame, its label on the top border, nested frames inside', () => {
    expect(
      text(block('columns 2', 'block:g["Group"]', 'a', 'block:h', 'b', 'end', 'end', 'c'))
    ).toBe(
      lines(
        '┌─────────── Group ────────────┐    ┌──────────────────────────────┐',
        '│                              │    │                              │',
        '│  ┌─────────┐    ┌─────────┐  │    │                              │',
        '│  │         │    │         │  │    │                              │',
        '│  │         │    │  ┌───┐  │  │    │                              │',
        '│  │    a    │    │  │ b │  │  │    │              c               │',
        '│  │         │    │  └───┘  │  │    │                              │',
        '│  │         │    │         │  │    │                              │',
        '│  └─────────┘    └─────────┘  │    │                              │',
        '│                              │    │                              │',
        '└──────────────────────────────┘    └──────────────────────────────┘'
      )
    );
  });

  it('draws nothing for an empty diagram', () => {
    expect(draw(block())).toEqual({ text: '', warnings: [] });
  });

  it('puts a blank line above and below each label with ascii.padding roomy', () => {
    expect(text(block('a b', 'a --> b'), { padding: 'roomy' })).toBe(
      lines(
        '┌─────┐      ┌─────┐',
        '│     │      │     │',
        '│  a  ├─────►│  b  │',
        '│     │      │     │',
        '└─────┘      └─────┘'
      )
    );
  });
});

describe('labels (D449)', () => {
  it('cuts a label longer than 40 cells with …, ~ in the ascii charset', () => {
    const src = block(`a["${'x'.repeat(50)}"]`);
    expect(text(src).split('\n')[1]).toBe(`│ ${'x'.repeat(39)}… │`);
    expect(text(src, { charset: 'ascii' }).split('\n')[1]).toBe(`| ${'x'.repeat(39)}~ |`);
  });

  it('cuts labels shorter until the drawing fits ascii.maxWidth', () => {
    const src = block('columns 3', 'a["alpha beta"] b["gamma delta"] c["epsilon zeta"]');
    expect(text(src, { maxWidth: 30 })).toBe(
      lines(
        '┌─────┐    ┌─────┐    ┌─────┐',
        '│ al… │    │ ga… │    │ ep… │',
        '└─────┘    └─────┘    └─────┘'
      )
    );
  });

  it('never crops: a drawing that still does not fit is drawn whole (the API warns)', () => {
    const d = draw(block('columns 3', 'a b c'), { maxWidth: 5 });
    expect(d.text.split('\n')[1]).toBe('│ a │    │ b │    │ c │');
    expect(d.warnings).toEqual([]);
  });
});

describe('shapes', () => {
  it('draws each shape in its text form, as flowchart does', () => {
    const src = block(
      'columns 4',
      'a("round") b(("circle")) c(["stadium"]) d{"diamond"}',
      'e{{"hex"}} f[["sub"]] g[("cyl")] h[/"trap"\\]'
    );
    const d = draw(src);
    expect(d.text).toBe(
      lines(
        '╭─────────╮    ╭─────────╮    ╭─────────╮    ┌────◇────┐',
        '│  round  │    │ circle  │    │ stadium │    ◇ diamond ◇',
        '╰─────────╯    ╰─────────╯    ╰─────────╯    └────◇────┘',
        '',
        '',
        '┌─────────┐    ╓─────────╖    ╒═════════╕    ┌─────────┐',
        '<   hex   >    ║   sub   ║    │   cyl   │    │  trap   │',
        '└─────────┘    ╙─────────╜    ╘═════════╛    └─────────┘'
      )
    );
    // The trapezoid has no text form: a plain box, named once (D82).
    expect(d.warnings).toEqual([
      expect.objectContaining({ code: 'ASCII_SHAPE', shapes: ['trapezoid'], astIds: ['block:h'] }),
    ]);
  });

  it('draws a block arrow as a box with an arrowhead on each side it points to', () => {
    expect(text(block('a<["go"]>(right) b<["back"]>(left) c<["both"]>(x) d<["vert"]>(y)'))).toBe(
      lines(
        '┌──────┐    ┌──────┐    ┌──────┐    ┌──▲───┐',
        '│  go  ►    ◄ back │    ◄ both ►    │ vert │',
        '└──────┘    └──────┘    └──────┘    └──▼───┘'
      )
    );
    expect(text(block('a<["up"]>(up)'), { charset: 'ascii' })).toBe(
      lines('+-^--+', '| up |', '+----+')
    );
  });
});

describe('edges (D449)', () => {
  it('draws an edge as a stepped line, leaving its box at a tee, into an arrowhead', () => {
    expect(text(block('columns 2', 'a b', 'c d', 'a --> d'))).toBe(
      lines(
        '┌───┐    ┌───┐',
        '│ a ├──┐ │ b │',
        '└───┘  │ └───┘',
        '       │',
        '       │',
        '┌───┐  │ ┌───┐',
        '│ c │  └►│ d │',
        '└───┘    └───┘'
      )
    );
  });

  it('ends in nothing, two arrowheads, a cross or a circle as the link says', () => {
    expect(
      text(
        block('columns 2', 'a b', 'c d', 'e f', 'g h', 'a --- b', 'c <--> d', 'e --x f', 'g --o h')
      )
        .split('\n')
        .filter((_, i) => i % 5 === 1)
    ).toEqual(['│ a ├────┤ b │', '│ c │◄──►│ d │', '│ e ├───✕│ f │', '│ g ├───●│ h │']);
  });

  it('draws thick and dotted lines', () => {
    const rows = text(block('columns 2', 'a b', 'c d', 'a ==> b', 'c -.-> d')).split('\n');
    expect([rows[1], rows[6]]).toEqual(['│ a ┝━━━►│ b │', '│ c ├┄┄┄►│ d │']);
    const ascii = text(block('columns 2', 'a b', 'c d', 'a ==> b', 'c -.-> d'), {
      charset: 'ascii',
    }).split('\n');
    expect([ascii[1], ascii[6]]).toEqual(['| a +===>| b |', '| c +...>| d |']);
  });

  it('writes a label on its line where the line has room, else beside it', () => {
    expect(text(block('columns 3', 'a space b', 'a -- "yes" --> b')).split('\n')[1]).toBe(
      '│ a ├──── yes ───►│ b │'
    );
    expect(text(block('columns 2', 'a b', 'a -- "yes" --> b'))).toBe(
      lines('    yes', '┌───┐    ┌───┐', '│ a ├───►│ b │', '└───┘    └───┘')
    );
  });

  it('draws a self-loop out of one side and back into the next', () => {
    expect(text(block('a', 'a --> a'))).toBe(
      lines('   ┌──┐', '   │  │', '┌──┴┐ │', '│ a │◄┘', '└───┘')
    );
  });

  it('ends an edge to its own composite inside the frame, never on it (pitfall 20)', () => {
    expect(text(block('block:g', 'a', 'end', 'a --> g'))).toBe(
      lines(
        '┌─────────┐',
        '│         │',
        '│  ┌───┐  │',
        '│  │ a ├─►│',
        '│  └───┘  │',
        '│         │',
        '└─────────┘'
      )
    );
  });

  it('crosses a frame straight through to a block outside it', () => {
    expect(
      text(block('columns 2', 'block:g["G"]', 'a', 'end', 'b', 'a --> b'), { charset: 'ascii' })
    ).toBe(
      lines(
        '+--- G ---+    +---------+',
        '|         |    |         |',
        '|  +---+  |    |         |',
        '|  | a +--+--->|    b    |',
        '|  +---+  |    |         |',
        '|         |    |         |',
        '+---------+    +---------+'
      )
    );
  });
});

describe('what text drops', () => {
  it('ignores block.padding, an invalid one included, with no warning (D449)', () => {
    const plain = draw(block('a b'));
    for (const padding of [40, -1, 'x'])
      expect(draw(block('a b'), { block: { padding } })).toEqual(plain);
  });

  it('warns once for styles and classes, naming the blocks and the statements', () => {
    expect(
      draw(block('a b', 'classDef red fill:#f00', 'class a red', 'style b fill:#0f0')).warnings
    ).toEqual([
      expect.objectContaining({
        code: 'ASCII_DROPPED',
        feature: 'style',
        astIds: ['block:a', 'block:b', 'classDef:red', 'class:1', 'style:1'],
      }),
    ]);
  });
});
