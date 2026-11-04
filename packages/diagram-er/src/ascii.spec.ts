import { describe, expect, it } from 'vitest';
import { draw, text } from './ascii/er.fixtures.ts';

// The ER diagram's `ascii` hook (#136, D76, D82, D109, R-ASCII-1, R-ASCII-5), called through
// the `./ascii` entry as a pipeline does (parse → cell layout → hook), with the generated `er`
// defaults, which do not convert in cells: the cell profile's spacing and widths (D118).

const lines = (...rows: string[]): string => rows.join('\n');
const rowsWith = (out: string, s: string): string[] => out.split('\n').filter((r) => r.includes(s));

describe('relationships', () => {
  it('draws TB top to bottom: tees, a bar pair at the one end, ring and foot at the many end', async () => {
    expect(await text('erDiagram\n  A ||--o{ B : x')).toBe(
      lines(
        '┌───┐',
        '│ A │',
        '└─┬─┘',
        '  ╪',
        '  ╪',
        '  │',
        '  x',
        '  │',
        '  o',
        '  Λ',
        '┌─┴─┐',
        '│ B │',
        '└───┘'
      )
    );
  });

  it('draws BT with the feet opening upwards, and dotted lines for non-identifying', async () => {
    expect(await text('erDiagram\ndirection BT\nA |o..|{ B : y')).toBe(
      lines(
        '┌───┐',
        '│ B │',
        '└─┬─┘',
        '  V',
        '  ╪',
        '  ┆',
        '  y',
        '  ┆',
        '  o',
        '  ╪',
        '┌─┴─┐',
        '│ A │',
        '└───┘'
      )
    );
  });

  it('draws LR and RL across with mermaid-ascii’s marks (`||`, `|o`, `}|`, `o{`)', async () => {
    const lr = await text(
      'erDiagram\ndirection LR\nA ||--o{ B : x\nC |o..|{ D : y\nE }|--|| F : z'
    );
    expect(rowsWith(lr, '│ ')).toEqual([
      '│ A ├||─ x ─o{┤ B │',
      '│ C ├|o┄ y ┄|{┤ D │',
      '│ E ├}|─ z ─||┤ F │',
    ]);
    const rl = await text('erDiagram\ndirection RL\nA }o--|| B : z');
    expect(rowsWith(rl, '│ ')).toEqual(['│ B ├||─ z ─o{┤ A │']);
  });

  it('draws the MD parent end as one mark', async () => {
    const out = await text('erDiagram\ndirection LR\nG u--o| H : w');
    expect(rowsWith(out, '│ ')).toEqual(['│ G ├◇── w ─o|┤ H │']);
  });

  it('has an ascii form of every mark', async () => {
    const lr = await text(
      'erDiagram\ndirection LR\nA ||--o{ B : x\nC |o..|{ D : y\nG u--}o H : w',
      {
        charset: 'ascii',
      }
    );
    expect(rowsWith(lr, '| ')).toEqual([
      '| A +||- x -o{+ B |',
      '| C +|o. y .|{+ D |',
      '| G +*-- w -o{+ H |',
    ]);
    const tb = await text('erDiagram\nA ||--o{ B : x', { charset: 'ascii' });
    expect(tb.split('\n').slice(3, 10)).toEqual(['  =', '  =', '  |', '  x', '  |', '  o', '  ^']);
    const bt = await text('erDiagram\ndirection BT\nA |o..|{ B : y', { charset: 'ascii' });
    expect(bt.split('\n')[3]).toBe('  v');
  });

  it('puts the marks of a relationship to itself on its loop, label beside it', async () => {
    expect(await text('erDiagram\nEMPLOYEE ||--o{ EMPLOYEE : manages')).toBe(
      lines(
        '┌──────────┐',
        '│          ├||┐',
        '│ EMPLOYEE │  │  manages',
        '│          ├}o┘',
        '└──────────┘'
      )
    );
  });

  it('keeps a far mark off a corner: only the near mark where the line turns next to the box', async () => {
    const out = await text('erDiagram\nA ||--|{ B : "two words"\nA ||--|{ C : ""');
    expect(rowsWith(out, '╪ ╪')).toEqual(['      ╪ ╪', '      ╪ ╪']);
    expect(out).toContain('two words');
    expect(rowsWith(out, 'Λ')).toEqual(['    Λ      Λ']);
  });
});

describe('entities', () => {
  it('draws a table as mermaid-ascii does: name band, rule, shared columns, keys and comments', async () => {
    const src = [
      'erDiagram',
      'ORDER {',
      'int id PK "unique identifier"',
      'int customerId FK',
      'string trackingCode UK',
      'decimal total "includes tax"',
      '}',
    ].join('\n');
    // attributes_keys_and_comments, verbatim.
    expect(await text(src)).toBe(
      lines(
        '┌─────────────────────────────────────────────────┐',
        '│                      ORDER                      │',
        '├─────────┬──────────────┬────┬───────────────────┤',
        '│ int     │ id           │ PK │ unique identifier │',
        '│ int     │ customerId   │ FK │                   │',
        '│ string  │ trackingCode │ UK │                   │',
        '│ decimal │ total        │    │ includes tax      │',
        '└─────────┴──────────────┴────┴───────────────────┘'
      )
    );
    expect(await text(src, { charset: 'ascii' })).toBe(
      lines(
        '+-------------------------------------------------+',
        '|                      ORDER                      |',
        '+---------+--------------+----+-------------------+',
        '| int     | id           | PK | unique identifier |',
        '| int     | customerId   | FK |                   |',
        '| string  | trackingCode | UK |                   |',
        '| decimal | total        |    | includes tax      |',
        '+---------+--------------+----+-------------------+'
      )
    );
  });

  it('shows the alias and generics as <T>; a plain entity is its name centred in a box', async () => {
    expect(await text('erDiagram\nA["Alias A"] {\n  List~int~ items\n}\nB')).toBe(
      lines(
        '┌───────────────────┐',
        '│      Alias A      │  ┌───┐',
        '├───────────┬───────┤  │ B │',
        '│ List<int> │ items │  └───┘',
        '└───────────┴───────┘'
      )
    );
  });

  it('measures in cells: wide graphemes take two', async () => {
    const out = await text('erDiagram\n"顧客" ||--o{ 注文 : 発注');
    expect(rowsWith(out, '顧客')).toEqual(['│ 顧客 │']);
    expect(rowsWith(out, '発注')).toEqual(['   発注']);
  });
});

describe('subgraphs', () => {
  it('draws a frame with the title on the top border; a line crossing it joins the frame', async () => {
    const src =
      'erDiagram\ndirection LR\nsubgraph S [Sales]\n  A ||--o{ B : has\nend\nC }|--|| A : makes';
    expect(await text(src)).toBe(
      lines(
        '                  ┌───────── Sales ─────────┐',
        '                  │                         │',
        '┌───┐             │   ┌───┐           ┌───┐ │',
        '│ C ├}|─ makes ───┼─||┤ A ├||─ has ─o{┤ B │ │',
        '└───┘             │   └───┘           └───┘ │',
        '                  │                         │',
        '                  └─────────────────────────┘'
      )
    );
  });
});

describe('warnings', () => {
  it('warns once per dropped feature kind, naming the AST ids', async () => {
    const src = [
      'erDiagram',
      'CUSTOMER ||--o{ ORDER : places',
      'style CUSTOMER fill:#f00',
      'classDef hot stroke:#f00',
      'class ORDER hot',
      'accTitle: T',
      'accDescr: D',
    ].join('\n');
    const { warnings } = await draw(src);
    expect(warnings.map((w) => [w.code, (w as { feature?: string }).feature, w.astIds])).toEqual([
      ['ASCII_DROPPED', 'style', ['n:CUSTOMER', 'n:ORDER', 'style:1', 'classDef:1', 'class:1']],
      ['ASCII_DROPPED', 'accessibility', ['accTitle:1', 'accDescr:1']],
    ]);
  });

  it('warns about a classDef no entity uses', async () => {
    const { warnings } = await draw('erDiagram\nA ||--o{ B : x\nclassDef hot fill:#f00');
    expect(warnings.map((w) => w.astIds)).toEqual([['classDef:1']]);
  });

  it('warns about nothing in a plain diagram', async () => {
    const src = 'erDiagram\ndirection LR\nA ||--o{ B : x\nA { int id PK }\nsubgraph S\nB\nend';
    expect((await draw(src)).warnings).toEqual([]);
  });

  it('turns routes the repair router could not free into one warning', async () => {
    // The engine never leaves a line under a box, so the layout is staged: C moves onto the
    // last cell of A → B.
    const { warnings } = await draw('erDiagram\ndirection LR\nA ||--o{ B : x\nC', {
      tweak: (layout) => {
        const end = layout.edges.get('e:A>B')!.points.at(-1)!;
        const c = layout.nodes.get('n:C')!;
        layout.nodes.set('n:C', { ...c, x: end.x, y: end.y });
      },
    });
    expect(warnings.filter((w) => w.code === 'ASCII_ROUTE').map((w) => w.astIds)).toEqual([
      ['e:A>B'],
    ]);
  });
});

describe('text', () => {
  it('puts the front-matter title centred on the first line', async () => {
    const out = await text('---\ntitle: Shop\n---\nerDiagram\nCUSTOMER ||--o{ ORDER : places');
    expect(out.split('\n').slice(0, 3)).toEqual(['    Shop', '┌──────────┐', '│ CUSTOMER │']);
  });

  it('redoes a layout that is not in cells', async () => {
    const src = 'erDiagram\nA ||--o{ B : x\nA { int id PK }';
    expect(await text(src, { px: true })).toBe(await text(src));
  });

  it('has no trailing spaces, only ASCII in ascii, and is deterministic', async () => {
    const src =
      'erDiagram\nsubgraph s [S]\nA ||--o{ B : has\nend\nB }|..|| C : "label here"\nC ||--o| A : back\nA { string name PK "c" }';
    for (const charset of ['unicode', 'ascii'] as const) {
      const a = await text(src, { charset });
      expect(a).not.toMatch(/ $/m);
      expect(await text(src, { charset })).toBe(a);
      if (charset === 'ascii') expect(a).not.toMatch(/[^\x20-\x7e\n]/);
    }
  });
});
