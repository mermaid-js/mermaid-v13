// cspell:words nonterminal
import { describe, expect, it } from 'vitest';
import { draw, mainRowClashes, text } from './ascii/railroad.fixtures.ts';
import { railroadLayoutViolations } from './layout/invariants.ts';
import { parseRailroad } from './parser/index.ts';

// Railroad's `ascii` hook (#617, D518, D320, R-ASCII-5, R-ASCII-6), through the `./ascii` entry
// with the layout the plugin makes under the cell profile. D518: the SVG geometry at cell scale,
// choices centred, the bypass above and the loop below, `╭╮╰╯` corners, no repeat counts.

const lines = (...rows: string[]): string => rows.join('\n');
const ir = (...rules: string[]): string => ['railroad-beta', ...rules].join('\n');

describe('boxes and track', () => {
  const SEQ = ir('r = sequence(terminal("a"), nonterminal("b"), special("c"));');

  it('draws terminals rounded, nonterminals square and specials dotted, on one track', async () => {
    expect(await text(SEQ)).toBe(
      lines(
        '      ╭───╮ ┌───┐ ┌┄┄┄┄┄┄┄┐',
        'r = ●─┤ a ├─┤ b ├─┤ ? c ? ├─●',
        '      ╰───╯ └───┘ └┄┄┄┄┄┄┄┘'
      )
    );
  });

  it('has an ascii form: / \\ corners for terminals, + elsewhere, o markers', async () => {
    expect(await text(SEQ, { charset: 'ascii' })).toBe(
      lines(
        '      /---\\ +---+ +.......+',
        'r = o-+ a +-+ b +-+ ? c ? +-o',
        '      \\---/ +---+ +.......+'
      )
    );
  });

  it('draws a text as one row: a line break is a space, a wide character two cells', async () => {
    expect(await text('railroad-ebnf-beta\nr = "顧客" , ? multi\nline ? ;')).toBe(
      lines(
        '      ╭──────╮ ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐',
        'r = ●─┤ 顧客 ├─┤ ? multi line ? ├─●',
        '      ╰──────╯ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘'
      )
    );
  });

  it('draws PEG predicates and `.` as specials, as SVG does', async () => {
    expect(await text('railroad-peg-beta\nA <- &"a" !B . ;')).toBe(
      lines(
        '      ┌┄┄┄┄┄┄┄┄┄┄┐ ┌┄┄┄┄┄┄┄┄┐ ┌┄┄┄┄┄┄┄┐',
        'A = ●─┤ ? &"a" ? ├─┤ ? !B ? ├─┤ ? . ? ├─●',
        '      └┄┄┄┄┄┄┄┄┄┄┘ └┄┄┄┄┄┄┄┄┘ └┄┄┄┄┄┄┄┘'
      )
    );
  });

  it('draws nothing for a diagram with no rules', async () => {
    expect(await text('railroad-beta')).toBe('');
  });
});

describe('choices (D518: centred, as SVG)', () => {
  it('runs an odd count’s middle branch straight, the others branching off ┼', async () => {
    expect(await text(ir('r = choice(terminal("a"), terminal("bb"), terminal("c"));'))).toBe(
      lines(
        '        ╭───╮',
        '       ╭┤ a ├─╮',
        '       │╰───╯ │',
        '       │╭────╮│',
        'r = ●──┼┤ bb ├┼──●',
        '       │╰────╯│',
        '       │╭───╮ │',
        '       ╰┤ c ├─╯',
        '        ╰───╯'
      )
    );
  });

  it('puts an even count’s main line between the branches, none straight', async () => {
    const src = ir('r = choice(terminal("a"), terminal("bbb"));');
    expect(await text(src)).toBe(
      lines(
        '         ╭───╮',
        '       ╭─┤ a ├─╮',
        '       │ ╰───╯ │',
        '       │       │',
        'r = ●──┤       ├──●',
        '       │       │',
        '       │╭─────╮│',
        '       ╰┤ bbb ├╯',
        '        ╰─────╯'
      )
    );
    expect(await text(src, { charset: 'ascii' })).toBe(
      lines(
        '         /---\\',
        '       +-+ a +-+',
        '       | \\---/ |',
        '       |       |',
        'r = o--+       +--o',
        '       |       |',
        '       |/-----\\|',
        '       ++ bbb ++',
        '        \\-----/'
      )
    );
  });
});

describe('main line clearance in cells (#617 review)', () => {
  const ebnf = (rule: string): string => `railroad-ebnf-beta\nr = ${rule} ;`;
  const CASES = [
    '"a" | "b"',
    '["a"] | "b"',
    '{"a" | "bb"}',
    '"a" , ("b" | "c")',
    '"a" | ["b"]',
    '{"a"} | "b"',
    '"a" | "b" | ["c"] | {"d"}',
  ];

  it.each(CASES)('keeps %s off the main row, a full row clear, in both presets', async (rule) => {
    for (const padding of ['compact', 'roomy'] as const) {
      const { layout, text: out } = await draw(ebnf(rule), { padding });
      expect(mainRowClashes(layout), `${padding}\n${out}`).toEqual([]);
    }
  });

  it('puts a two-branch main line a blank row from each box', async () => {
    expect(await text(ebnf('"a" | "b"'), { padding: 'roomy' })).toBe(
      lines(
        '        ╭─────╮',
        '        │     │',
        '       ╭┤  a  ├╮',
        '       ││     ││',
        '       │╰─────╯│',
        '       │       │',
        'r = ●──┤       ├──●',
        '       │       │',
        '       │╭─────╮│',
        '       ││     ││',
        '       ╰┤  b  ├╯',
        '        │     │',
        '        ╰─────╯'
      )
    );
  });
});

describe('optionals and repetitions (D518: bypass above, loop below)', () => {
  const SRC = ir(
    'r = optional(terminal("x"));',
    's = oneOrMore(terminal("y"));',
    't = zeroOrMore(nonterminal("z"));'
  );

  it('draws the bypass above, the loop below, both for zero or more; rules apart', async () => {
    expect(await text(SRC)).toBe(
      lines(
        '       ╭─────╮',
        '       │     │',
        '       │╭───╮│',
        'r = ●──┴┤ x ├┴──●',
        '        ╰───╯',
        '',
        '        ╭───╮',
        's = ●──┬┤ y ├┬──●',
        '       │╰───╯│',
        '       │     │',
        '       ╰─────╯',
        '',
        '       ╭─────╮',
        '       │     │',
        '       │┌───┐│',
        't = ●──┼┤ z ├┼──●',
        '       │└───┘│',
        '       │     │',
        '       ╰─────╯'
      )
    );
  });

  it('shows no repeat count: ABNF 3*5x, 1*x and 2x draw the same (D518)', async () => {
    const out = await text('railroad-abnf-beta\na = 3*5"x";\nb = 1*"x";\nc = 2"x";');
    const [a, b, c] = out.split('\n\n');
    expect(a!.replace('a =', 'b =')).toBe(b);
    expect(c!.replace('c =', 'b =')).toBe(b);
  });
});

describe('ascii options', () => {
  it('honours ascii.padding roomy: two blank cells each side and a blank row above and below', async () => {
    expect(await text(ir('digit = terminal("0");'), { padding: 'roomy' })).toBe(
      lines(
        '          ╭─────╮',
        '          │     │',
        'digit = ●─┤  0  ├─●',
        '          │     │',
        '          ╰─────╯'
      )
    );
  });

  it('lays out in cells within the layout invariants, in both presets', async () => {
    const src = ir(
      'r = sequence(optional(choice(terminal("+"), terminal("-"))), oneOrMore(nonterminal("d")));',
      's = zeroOrMore(sequence(terminal(","), choice(nonterminal("a"), special("b c"))));'
    );
    const { model } = parseRailroad(src);
    for (const padding of ['compact', 'roomy'] as const) {
      const { layout } = await draw(src, { padding });
      expect(layout.units).toBe('cell');
      expect(railroadLayoutViolations(model, layout)).toEqual([]);
    }
  });

  it('takes the padding from the cell profile, not from the config', async () => {
    const src = ir('r = terminal("a");');
    expect(await text(src, { configPadding: 'roomy' })).toBe(await text(src));
  });

  it('checks a layout without its metrics without throwing', async () => {
    const src = ir('r = terminal("a");');
    const { layout } = await draw(src);
    const { model } = parseRailroad(src);
    const bare = { ...layout, metrics: undefined } as unknown as typeof layout;
    expect(() => railroadLayoutViolations(model, bare)).not.toThrow();
    expect(railroadLayoutViolations(model, bare)).toEqual([]);
  });

  it('draws a layout already in cells as it is, for a caller outside the pipeline', async () => {
    const src = ir('r = choice(terminal("a"), optional(nonterminal("b")));');
    const given = await draw(src, { cellLayout: true });
    expect(given.layout.units).toBe('cell');
    expect(given.text).toBe(await text(src));
  });
});

describe('warnings (D82, pitfall 22)', () => {
  const PLAIN = ir('r = terminal("a");');

  it('warns about nothing in a plain diagram, the defaults set by the config included', async () => {
    expect((await draw(PLAIN)).warnings).toEqual([]);
    expect((await draw(PLAIN, { railroad: { padding: 10, arcRadius: '10' } })).warnings).toEqual(
      []
    );
  });

  it('warns once about accTitle and accDescr, naming their statements', async () => {
    const { warnings } = await draw(ir('accTitle: T', 'accDescr: D', 'r = terminal("a");'));
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'ASCII_DROPPED',
        feature: 'accessibility',
        astIds: ['accTitle', 'accDescr'],
      }),
    ]);
  });

  it('warns once about the colours and fonts set, and once about the px lengths set', async () => {
    const railroad = { terminalFill: '#ff0000', fontSize: 20, padding: 30, arcRadius: -1 };
    const { warnings, text: out } = await draw(PLAIN, { railroad });
    expect(warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
      ['ASCII_DROPPED', 'style'],
      ['ASCII_DROPPED', 'lengths'],
    ]);
    expect(warnings[0]!.message).toContain('railroad.terminalFill, railroad.fontSize');
    expect(warnings[1]!.message).toContain('railroad.padding, railroad.arcRadius');
    // Text has its own lengths: no RAILROAD_CONFIG_INVALID for the unusable one, same drawing.
    expect(out).toBe(await text(PLAIN));
  });

  it('draws no title, as SVG draws none (D218), and does not warn about it', async () => {
    const titled = await draw('---\ntitle: Front\n---\n' + ir('title In', 'r = terminal("a");'));
    expect(titled.text).toBe(await text(PLAIN));
    expect(titled.warnings).toEqual([]);
  });
});

describe('text', () => {
  it('has no trailing spaces, only ASCII in ascii, and is deterministic', async () => {
    const src = ir(
      'r = sequence(optional(terminal("a")), choice(nonterminal("b"), zeroOrMore(special("c"))));'
    );
    for (const charset of ['unicode', 'ascii'] as const) {
      const a = await text(src, { charset });
      expect(a).not.toMatch(/ $/m);
      expect(await text(src, { charset })).toBe(a);
      if (charset === 'ascii') expect(a).not.toMatch(/[^\x20-\x7e\n]/);
    }
  });
});

type RawGlob = (
  pattern: string,
  options: { query: '?raw'; import: 'default'; eager: true }
) => Readonly<Record<string, string>>;

describe('bundles (#617 review)', () => {
  // The cell tables and measurer are the `./ascii` entry's: the SVG chunk (`.`) reaches none of
  // them, so an SVG render loads what it loaded before text output existed.
  it('keeps the cell layout out of what the runtime entry imports', () => {
    const sources = (import.meta as ImportMeta & { glob: RawGlob }).glob('./**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file) || !(file in sources)) return;
      seen.add(file);
      const dir = file.slice(0, file.lastIndexOf('/') + 1);
      for (const m of sources[file]!.matchAll(/from '(\.[^']+)'/g)) {
        const parts = `${dir}${m[1]}`.split('/');
        const out: string[] = [];
        for (const p of parts) {
          if (p === '..') out.pop();
          else if (p !== '.' || out.length === 0) out.push(p);
        }
        visit(out.join('/'));
      }
    };
    visit('./index.ts');
    expect(seen.has('./plugin.ts')).toBe(true);
    expect([...seen].filter((f) => f.includes('cells.ts') || f.startsWith('./ascii'))).toEqual([]);
  });
});
