import { describe, expect, it } from 'vitest';
import { draw, text } from './ascii/usecase.fixtures.ts';
import { undrawnConfig } from './ascii/warnings.ts';
import { usecaseLayoutConfig } from './config.ts';

// The usecase `ascii` hook (spec #517 T7, D320, D478, R-ASCII-5, R-ASCII-6), called through the
// `./ascii` entry as the pipeline does (parse → layout in cells → hook), with the generated
// `usecase` defaults, which do not convert in cells: the cell profile's spacing and widths.

const H = 'usecase-beta\n';
const lines = (...rows: string[]): string => rows.join('\n');
const dropped = (warnings: readonly { code: string }[]) =>
  warnings.map((w) => [w.code, (w as { feature?: string }).feature]);

describe('shapes (D478)', () => {
  it('draws an actor as a three-line figure with its name under it, a use case as ( label )', async () => {
    expect(await text(H + 'actor User\nUser --> Login')).toBe(
      lines('  O', ' /|\\    ╭───────╮', ' / \\───►( Login )', 'User    ╰───────╯')
    );
  });

  it('draws a rect use case as [ label ], and takes TB from the text', async () => {
    expect(
      await text(H + 'direction TB\nactor User\nUser --> Login\nUser --> Pay[Pay order]')
    ).toBe(
      lines(
        '          O',
        '         /|\\',
        '         / \\',
        '        User',
        '         │ │',
        '         │ │',
        '    ┌────┘ └─────┐',
        '    ▼            ▼',
        '╭───────╮  ┌───────────┐',
        '( Login )  [ Pay order ]',
        '╰───────╯  └───────────┘'
      )
    );
  });

  it('draws a boundary as a frame with its title in the top border, a note as a box on a dotted line', async () => {
    expect(
      await text(H + 'systemBoundary Shop\nLogin\nend\nnote for Login "Needs an account"')
    ).toBe(
      lines(
        '                        ┌──── Shop ───┐',
        '                        │             │',
        '┌──────────────────┐    │   ╭───────╮ │',
        '│ Needs an account ├┄┄┄┄┼┄┄┄( Login ) │',
        '└──────────────────┘    │   ╰───────╯ │',
        '                        │             │',
        '                        └─────────────┘'
      )
    );
  });

  it('draws a package boundary as a frame too (no tab in text)', async () => {
    const pkg = await text(H + 'systemBoundary Shop@{ type: package }\nLogin\nend');
    expect(pkg).toBe(await text(H + 'systemBoundary Shop\nLogin\nend'));
  });

  it('draws a JSON table as a key/value box', async () => {
    expect(await text(H + 'json P@{ "a": 1, "b": { "c": "x" } }')).toBe(
      lines(
        '┌─────────┐',
        '│    P    │',
        '├─────┬───┤',
        '│ a   │ 1 │',
        '│ b.c │ x │',
        '└─────┴───┘'
      )
    );
    expect(await text(H + 'json P@{ "a": 1 }', { charset: 'ascii' })).toBe(
      lines('+-------+', '|   P   |', '+---+---+', '| a | 1 |', '+---+---+')
    );
  });

  it('puts a stereotype over the name, «…» in unicode and <<…>> in ascii', async () => {
    const src = H + 'actor A <<Person>>\nU("Sign in") <<Core>>\nA --> U';
    expect(await text(src)).toBe(
      lines(
        '    O       ╭─────────╮',
        '   /|\\      ( «Core»  )',
        '   / \\─────►( Sign in )',
        '«Person»    ╰─────────╯',
        '   A'
      )
    );
    expect(await text(src, { charset: 'ascii' })).toBe(
      lines(
        '     O        +----------+',
        '    /|\\       ( <<Core>> )',
        '    / \\------>( Sign in  )',
        '<<Person>>    +----------+',
        '    A'
      )
    );
  });

  it('keeps the D478 shapes with roomy padding', async () => {
    expect(await text(H + 'actor A\nA --> B', { padding: 'roomy' })).toBe(
      lines(' O      ╭───╮', '/|\\     │   │', '/ \\────►( B )', ' A      │   │', '        ╰───╯')
    );
  });
});

describe('relationships (D478)', () => {
  it('draws include and extend dotted, labelled «include» and «extend»', async () => {
    const src = H + 'A ..> : include B\nC ..> : extend A';
    expect(await text(src)).toBe(
      lines(
        '╭───╮              ╭───╮               ╭───╮',
        '( C )┄┄ «extend» ┄►( A )┄┄ «include» ┄►( B )',
        '╰───╯              ╰───╯               ╰───╯'
      )
    );
    expect(await text(src, { charset: 'ascii' })).toBe(
      lines(
        '+---+                +---+                 +---+',
        '( C ).. <<extend>> .>( A ).. <<include>> .>( B )',
        '+---+                +---+                 +---+'
      )
    );
  });

  it('draws a generalization with ▷, |> in ascii, in every direction', async () => {
    expect(await text(H + 'actor A\nactor B\nA --|> B')).toBe(
      lines(' O      O', '/|\\    /|\\', '/ \\───▷/ \\', ' A      B')
    );
    expect(await text(H + 'actor A\nactor B\nA --|> B', { charset: 'ascii' })).toBe(
      lines(' O      O', '/|\\    /|\\', '/ \\--|>/ \\', ' A      B')
    );
    expect(await text(H + 'direction RL\nA --|> B', { charset: 'ascii' })).toContain(
      '( B )<|--( A )'
    );
    expect(await text(H + 'direction TB\nA --|> B', { charset: 'ascii' })).toBe(
      lines('+---+', '( A )', '+-+-+', '  |', '  |', '  -', '  v', '+---+', '( B )', '+---+')
    );
    expect(await text(H + 'direction BT\nA --|> B', { charset: 'ascii' })).toBe(
      lines('+---+', '( B )', '+---+', '  ^', '  -', '  |', '  |', '+-+-+', '( A )', '+---+')
    );
    expect(await text(H + 'direction TB\nA --|> B')).toContain('  ▽\n╭───╮\n( B )');
  });

  it('draws every association end in both charsets', async () => {
    const src = H + 'A --o B\nC --x D\nE <-- F\nG o-- H\nI x-- J\nK -- L';
    const rows = (out: string) => out.split('\n').filter((l) => l.startsWith('('));
    expect(rows(await text(src))).toEqual([
      '( A )───●( B )',
      '( C )───✕( D )',
      '( E )◄───( F )',
      '( G )●───( H )',
      '( I )✕───( J )',
      '( K )────( L )',
    ]);
    expect(rows(await text(src, { charset: 'ascii' }))).toEqual([
      '( A )---o( B )',
      '( C )---x( D )',
      '( E )<---( F )',
      '( G )o---( H )',
      '( I )x---( J )',
      '( K )----( L )',
    ]);
  });

  it('keeps arrowheads inside a frame, off its border, with room for |> (pitfall 20)', async () => {
    const src =
      H + 'systemBoundary S["Shop"]\nA(Buy)\nB(Sell)\nend\nactor U\nU --> A\nC(Out) --|> B';
    expect(await text(src)).toBe(
      lines(
        '           ┌─── Shop ───┐',
        '           │            │',
        '     O     │   ╭─────╮  │',
        '    /|\\────┼──►( Buy )  │',
        '    / \\    │   ╰─────╯  │',
        '     U     │            │',
        '           │            │',
        '           │   ╭──────╮ │',
        '╭─────╮  ┌─┼──▷( Sell ) │',
        '( Out )──┘ │   ╰──────╯ │',
        '╰─────╯    │            │',
        '           └────────────┘'
      )
    );
    expect(await text(src, { charset: 'ascii' })).toBe(
      lines(
        '           +--- Shop ---+',
        '           |            |',
        '     O     |   +-----+  |',
        '    /|\\----+-->( Buy )  |',
        '    / \\    |   +-----+  |',
        '     U     |            |',
        '           |            |',
        '           |   +------+ |',
        '+-----+  +-+-|>( Sell ) |',
        '( Out )--+ |   +------+ |',
        '+-----+    |            |',
        '           +------------+'
      )
    );
  });
});

describe('text output', () => {
  it('redoes a layout that is not in cells', async () => {
    const src = H + 'actor User\nUser --> Login';
    expect(await text(src, { px: true })).toBe(await text(src));
  });

  it('is deterministic, with no trailing space', async () => {
    const src = H + 'actor A\nsystemBoundary S\nB\nC\nend\nA --> B\nA --> C\nB ..> : include C';
    const out = await text(src);
    expect(await text(src)).toBe(out);
    expect(out).not.toMatch(/ $/m);
  });

  it('puts the front-matter title on the first line', async () => {
    expect((await text('---\ntitle: Shop\n---\n' + H + 'A')).split('\n')).toEqual([
      'Shop',
      '╭───╮',
      '( A )',
      '╰───╯',
    ]);
  });

  it('converts a px spacing or wrap the author set, and not the defaults', async () => {
    const base = await text(H + 'A --> B');
    const wide = await text(H + 'A --> B', { config: { usecase: { nodeSpacing: 50 } } });
    expect(wide).toBe(base);
    const far = await text(H + 'A --> B', { config: { usecase: { rankSpacing: 160 } } });
    // 160 px is 20 cells between the ranks.
    expect(far).toContain(`( A )${'─'.repeat(19)}►( B )`);
    const narrow = await text(H + 'A("one two three four")', {
      config: { usecase: { wrappingWidth: 40 } },
    });
    expect(narrow.split('\n').length).toBeGreaterThan(3);
  });
});

describe('warnings (D82, D478, pitfall 22)', () => {
  it('drops business marks, icons and figures with one ASCII_DROPPED', async () => {
    const src =
      H +
      'actor A@{ business: true }\nactor B@{ icon: "fa:user" }\nactor C@{ type: hollow }\nU@{ business: true }\nA --> U';
    const { warnings } = await draw(src);
    expect(dropped(warnings)).toEqual([['ASCII_DROPPED', 'glyph']]);
    expect((warnings[0] as { astIds?: string[] }).astIds).toEqual([
      'actor:A',
      'actor:B',
      'actor:C',
      'usecase:U',
    ]);
  });

  it('warns once per kind for styles, emphasis, animation and accessibility', async () => {
    const src =
      H +
      'accTitle: T\nclassDef hot fill:#f00\nA:::hot\nB("`**bold**`")\nA e1@--> B\ne1@{ animate: true }\nstyle B stroke:#0f0';
    const { warnings } = await draw(src);
    expect(dropped(warnings)).toEqual([
      ['ASCII_DROPPED', 'style'],
      ['ASCII_DROPPED', 'emphasis'],
      ['ASCII_DROPPED', 'animation'],
      ['ASCII_DROPPED', 'accessibility'],
    ]);
  });

  it('warns for the usecase options text output cannot honour, only when set off their default', async () => {
    const undrawn = (section: Record<string, unknown>) =>
      undrawnConfig(usecaseLayoutConfig(section));
    expect(undrawn({ actorFontSize: 14, useMaxWidth: true, colorScheme: 'role' })).toEqual([]);
    expect(
      undrawn({ actorFontSize: 20, usecaseFontFamily: 'serif', colorScheme: 'rotate' })
    ).toEqual(['actorFontSize', 'usecaseFontFamily', 'colorScheme']);
    const { warnings } = await draw(H + 'A', {
      config: { usecase: { useMaxWidth: false, diagramPadding: 4 } },
    });
    expect(dropped(warnings)).toEqual([['ASCII_DROPPED', 'config']]);
    expect(warnings[0]!.message).toContain('useMaxWidth, diagramPadding');
    expect((await draw(H + 'A')).warnings).toEqual([]);
  });

  describe('curve (D760): text lines are always square', () => {
    const curve = async (config: Record<string, unknown>) =>
      dropped((await draw(H + 'A --> B', { config })).warnings);

    it('warns once for usecase.curve', async () => {
      expect(await curve({ usecase: { curve: 'basis' } })).toEqual([['ASCII_DROPPED', 'curve']]);
    });

    it('warns once for the top-level curve', async () => {
      expect(await curve({ curve: 'basis' })).toEqual([['ASCII_DROPPED', 'curve']]);
    });

    it('warns once when both are set', async () => {
      expect(await curve({ curve: 'basis', usecase: { curve: 'linear' } })).toEqual([
        ['ASCII_DROPPED', 'curve'],
      ]);
    });

    it('does not warn when no curve is set, or for flowchart.curve', async () => {
      expect(await curve({})).toEqual([]);
      expect(await curve({ flowchart: { curve: 'basis' } })).toEqual([]);
    });

    it('words the warning like the others', async () => {
      const { warnings } = await draw(H + 'A --> B', { config: { curve: 'basis' } });
      expect(warnings[0]!.message).toContain('edge curves');
    });
  });

  it('reads a numeric string as its number: diagramPadding "20" is the default, not dropped', async () => {
    const { warnings } = await draw(H + 'A', { config: { usecase: { diagramPadding: '20' } } });
    expect(warnings).toEqual([]);
  });

  it('warns once for a value the layout does not take: USECASE_CONFIG_IGNORED, no ASCII_DROPPED', async () => {
    const { warnings } = await draw(H + 'A', {
      config: { usecase: { diagramPadding: 'wide', actorFontWeight: 'heavy' } },
    });
    expect(dropped(warnings)).toEqual([
      ['USECASE_CONFIG_IGNORED', undefined],
      ['USECASE_CONFIG_IGNORED', undefined],
    ]);
  });
});
