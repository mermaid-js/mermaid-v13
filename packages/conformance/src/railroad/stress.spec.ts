import { describe, expect, it } from 'vitest';
import { railroadTokens } from '@mermaid-js/diagram-railroad/testing';
import type { RailroadNotation } from '@mermaid-js/diagram-railroad/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5, spec #526 T1: the four railroad lexers are linear in input size, in every
 * rule: unclosed comments and specials, long rules and unterminated strings among them. Shape
 * copied from `../wardley/stress.spec.ts` (pie's pattern): n and 8n units; linear is ~8x,
 * quadratic ~64x, and the bar is 24x. Timed with the shared {@link linearRatio} (#643, pitfall 5).
 * Not measured on a steady machine: the bar is a ratio.
 */
const IR = 'railroad-beta\n';
const E = 'railroad-ebnf-beta\n';
const A = 'railroad-abnf-beta\n';
const P = 'railroad-peg-beta\n';
/**
 * `[name, notation, build, scale]`: `build(n)` is about `n` characters; a shape with a `scale`
 * is lexed at `scale` times the sizes. Native `indexOf` hides a quadratic search below 32k
 * characters, so the shapes whose rescans would be `indexOf` calls run at 64k and 512k.
 */
const SHAPES: [
  name: string,
  notation: RailroadNotation,
  build: (n: number) => string,
  scale?: number,
][] = [
  // Comments and specials that are never closed.
  ['IR block comments, never closed', 'railroad', (n) => IR + '/*'.repeat(n / 2), 16],
  [
    'IR block comments on lines, never closed',
    'railroad',
    (n) => IR + 'a /* x\n'.repeat(n / 7),
    16,
  ],
  ['EBNF block comments, never closed', 'railroadEbnf', (n) => E + '/* '.repeat(n / 3), 16],
  ['EBNF ISO comments, never closed', 'railroadEbnf', (n) => E + '(*'.repeat(n / 2), 16],
  [
    'EBNF ISO comments on lines, never closed',
    'railroadEbnf',
    (n) => E + 'a = ( * b\n(* '.repeat(n / 13),
    16,
  ],
  ['EBNF a special, never closed', 'railroadEbnf', (n) => E + 'a = ? ' + 'x'.repeat(n)],
  ['EBNF specials, never closed', 'railroadEbnf', (n) => E + 'a = ' + '? x '.repeat(n / 4)],
  ['EBNF blank specials', 'railroadEbnf', (n) => E + 'a = ?' + ' '.repeat(n) + '?'],
  ['EBNF specials cut by ;', 'railroadEbnf', (n) => E + 'a = ' + '? x ; '.repeat(n / 6)],
  ['EBNF a multi-line special', 'railroadEbnf', (n) => E + 'a = ? ' + 'x\n'.repeat(n / 2) + '? ;'],
  ['PEG # comments', 'railroadPeg', (n) => P + '# c\n'.repeat(n / 4)],
  ['PEG entities where # comments start', 'railroadPeg', (n) => P + '#x;'.repeat(n / 3)],
  ['ABNF ; comments', 'railroadAbnf', (n) => A + 'a = "x" ; c\n'.repeat(n / 12)],
  ['ABNF a long ; comment', 'railroadAbnf', (n) => A + ';' + 'x'.repeat(n)],
  // Unterminated strings.
  ['IR an unterminated string', 'railroad', (n) => IR + 'a = terminal("' + 'x'.repeat(n)],
  [
    'IR escaped quotes, never closed',
    'railroad',
    (n) => IR + 'a = terminal("' + '\\"'.repeat(n / 2),
  ],
  [
    'EBNF escaped single quotes, never closed',
    'railroadEbnf',
    (n) => E + "a = '" + "\\'".repeat(n / 2),
  ],
  ['PEG quotes, never closed', 'railroadPeg', (n) => P + 'a <- ' + '"'.repeat(n)],
  ['PEG strings split by escaped line ends', 'railroadPeg', (n) => P + 'a <- "x\\\n'.repeat(n / 9)],
  ['ABNF an unterminated string', 'railroadAbnf', (n) => A + 'a = "' + 'x'.repeat(n)],
  ['ABNF quotes, never closed', 'railroadAbnf', (n) => A + 'a = ' + '"x" "'.repeat(n / 5)],
  // Long rules.
  [
    'IR a long rule',
    'railroad',
    (n) => IR + 'a = sequence(' + 'terminal("x"), '.repeat(n / 15) + 'terminal("y")) ;',
  ],
  [
    'IR a long nesting',
    'railroad',
    (n) => IR + 'a = ' + 'optional('.repeat(n / 9) + 'terminal("x")',
  ],
  ['EBNF a long rule', 'railroadEbnf', (n) => E + 'a = ' + '"x" | b , '.repeat(n / 10) + 'c ;'],
  ['EBNF stacked postfixes', 'railroadEbnf', (n) => E + 'a = b' + '*+?'.repeat(n / 3) + ' ;'],
  ['EBNF exceptions', 'railroadEbnf', (n) => E + 'a = b' + ' - c'.repeat(n / 4) + ' ;'],
  [
    'ABNF a long rule',
    'railroadAbnf',
    (n) => A + 'a = ' + '1*3b / %x41-5A '.repeat(n / 16) + '\n;',
  ],
  ['ABNF a long numval', 'railroadAbnf', (n) => A + 'a = %x' + '41.'.repeat(n / 3) + '\n;'],
  [
    'ABNF a long numval with a dangling dot',
    'railroadAbnf',
    (n) => A + 'a = %x' + '4'.repeat(n) + '.',
  ],
  ['ABNF digit runs', 'railroadAbnf', (n) => A + 'a = ' + '1'.repeat(n) + 'b'],
  ['PEG a long rule', 'railroadPeg', (n) => P + 'a <- ' + '!b c* / '.repeat(n / 8) + 'd ;'],
  ['many rules', 'railroadPeg', (n) => P + 'a <- "x" ;\n'.repeat(n / 11)],
  ['a long name', 'railroad', (n) => IR + 'a'.repeat(n) + ' = terminal("x") ;'],
  ['keyword-prefixed names', 'railroad', (n) => IR + 'a = ' + 'sequenceX choices '.repeat(n / 18)],
  ['title-prefixed names', 'railroadEbnf', (n) => E + 'a = ' + 'titles , '.repeat(n / 9) + 'b ;'],
  // Header items and the hidden rules every notation has.
  ['lines of unclosed accDescr {', 'railroadAbnf', (n) => A + 'accDescr {\n'.repeat(n / 11), 16],
  ['unclosed accDescr { on one line', 'railroad', (n) => IR + 'accDescr {'.repeat(n / 10)],
  ['accDescr then blank lines and no brace', 'railroadPeg', (n) => P + 'accDescr' + '\n'.repeat(n)],
  [
    'accTitle then blanks and no colon',
    'railroadEbnf',
    (n) => E + 'accTitle' + ' '.repeat(n) + 'x',
  ],
  ['a long title', 'railroad', (n) => IR + 'title ' + 'x '.repeat(n / 2)],
  ['titles with %% far away', 'railroadPeg', (n) => P + 'title x\n'.repeat(n / 8) + '%%'],
  ['blank lines', 'railroadEbnf', (n) => E + '\n'.repeat(n)],
  ['blank runs', 'railroadAbnf', (n) => A + ' \t\r\n'.repeat(n / 4) + 'x'],
  ['YAML openers on every other line', 'railroad', (n) => IR + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', 'railroadEbnf', (n) => E + '---\n' + 'x\n'.repeat(n / 2)],
  ['EBNF dash runs', 'railroadEbnf', (n) => E + 'a = ' + '-'.repeat(n)],
  ['directive openers, never closed', 'railroadPeg', (n) => P + 'a <- b %%{ !\n'.repeat(n / 13)],
  ['directive closers that fail', 'railroad', (n) => IR + 'a %%{' + '}%%x'.repeat(n / 4)],
  ['characters no rule takes', 'railroadPeg', (n) => P + 'a <- ' + '['.repeat(n)],
  ['line separators', 'railroad', (n) => IR + 'a '.repeat(n / 2)],
  ['CRLF rules', 'railroadAbnf', (n) => A + 'a = "x"\r\n;\r\n'.repeat(n / 12)],
  [
    'a string split by comment lines',
    'railroadEbnf',
    (n) => E + 'a = "' + 'x\n%% c\n'.repeat(n / 7),
  ],
  ['entities in strings', 'railroad', (n) => IR + 'a = terminal("' + '#a;'.repeat(n / 3) + '") ;'],
];

describe('stress: the railroad lexers are linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, notation, build, scale = 1) => {
      const small = build(4_000 * scale);
      const large = build(32_000 * scale);
      const lex = (src: string) => railroadTokens(notation, src);
      expect(
        linearRatio(
          () => lex(small),
          () => lex(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
