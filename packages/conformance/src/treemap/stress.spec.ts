import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutTreemap,
  type TreemapLayout,
  type TreemapModel,
  type TreemapNode,
} from '@mermaid-js/diagram-treemap';
import {
  treemapTestContext,
  treemapTestTheme,
  treemapTokens,
} from '@mermaid-js/diagram-treemap/testing';

/**
 * R-PARSE-7, pitfall 5: the treemap lexer is linear in input size, in every rule. v12's lexer is
 * linear on zero runs, blanks, rows and unclosed quotes, and quadratic on repeated unclosed
 * `accDescr {` (each rescans to the end for a `}`: 40k 337 ms, 80k 1,028 ms, 160k 3,701 ms,
 * spec #428). Shape copied from `../pie/stress.spec.ts`: n and 8n units; linear is ~8x,
 * quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of five, and small
 * and large lexes alternate. Not measured on a steady machine: the bar is a ratio.
 */
const TREEMAP = 'treemap\n';
const LEAF = TREEMAP + '"a": ';
/**
 * `[name, build, scale]`: `build(n)` is about `n` characters; a shape with a `scale` is lexed
 * at `scale` times the sizes. Native `indexOf` hides the quadratic `}` search below 32k
 * characters (radar's gate), so the unclosed-`accDescr {` lines run at 64k and 512k.
 */
const SHAPES: [name: string, build: (n: number) => string, scale?: number][] = [
  ['lines of unclosed accDescr {', (n) => TREEMAP + 'accDescr {\n'.repeat(n / 11), 16],
  ['unclosed accDescr { on one line', (n) => TREEMAP + 'accDescr {'.repeat(n / 10), 16],
  ['indented unclosed accDescr {', (n) => TREEMAP + '  accDescr {\n'.repeat(n / 13), 16],
  ['accDescr then blanks and no brace', (n) => TREEMAP + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => TREEMAP + 'accDescr' + '\n'.repeat(n)],
  ['accTitle then blanks and no colon', (n) => TREEMAP + 'accTitle' + ' '.repeat(n) + 'x'],
  ['a long zero run', (n) => LEAF + '0'.repeat(n)],
  ['a long number of every number character', (n) => LEAF + '0_.,'.repeat(n / 4)],
  ['zero runs split by letters', (n) => LEAF + '0e'.repeat(n / 2)],
  ['zero runs with minus signs', (n) => LEAF + '-0'.repeat(n / 2)],
  ['blanks before a title', (n) => TREEMAP + ' '.repeat(n) + 'title x'],
  ['blanks before a name', (n) => TREEMAP + ' '.repeat(n) + '"x"'],
  ['blanks then no rule', (n) => TREEMAP + ' '.repeat(n) + ';'],
  ['blank runs split by tabs', (n) => TREEMAP + ' \t'.repeat(n / 2) + '"x"'],
  ['blank lines', (n) => TREEMAP + '  \n'.repeat(n / 3) + '"x": 1'],
  ['empty lines', (n) => TREEMAP + '\n'.repeat(n) + '"x": 1'],
  ['a long title', (n) => TREEMAP + 'title ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => TREEMAP + 'title ' + '% '.repeat(n / 2)],
  ['an unterminated double quote', (n) => TREEMAP + '"' + 'x'.repeat(n)],
  ['an unterminated single quote', (n) => TREEMAP + "'" + 'x'.repeat(n)],
  ['an unterminated quote over lines', (n) => TREEMAP + '"' + 'x\n'.repeat(n / 2)],
  ['unterminated quotes after closed ones', (n) => TREEMAP + "'a' \"".repeat(n / 5)],
  ['a long string', (n) => TREEMAP + '"' + 'x'.repeat(n) + '": 1'],
  ['a string split by comment lines', (n) => TREEMAP + '"' + 'x\n%% c\n'.repeat(n / 7) + '": 1'],
  ['a long name', (n) => TREEMAP + 'a'.repeat(n)],
  ['classDef then blanks and no name', (n) => TREEMAP + 'classDef' + ' '.repeat(n) + '-'],
  ['classDef then blank lines and no name', (n) => TREEMAP + 'classDef' + '\n'.repeat(n) + '-'],
  ['classDef with long styles', (n) => TREEMAP + 'classDef ab ' + 'fill:red,'.repeat(n / 9)],
  ['classDefs with no styles', (n) => TREEMAP + 'classDef ab\n'.repeat(n / 12)],
  ['classDef names of one character', (n) => TREEMAP + 'classDef c\n'.repeat(n / 11)],
  ['a long trailing comment', (n) => LEAF + '1 %%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => LEAF + '1' + ';'.repeat(n)],
  ['many rows', (n) => TREEMAP + '  "a": 1\n'.repeat(n / 9)],
  ['rows on one line', (n) => TREEMAP + '"a":1,'.repeat(n / 6)],
  ['rows split by comment lines', (n) => TREEMAP + '"a": 1\n%% c\n'.repeat(n / 12)],
  ['directive openers, never closed', (n) => TREEMAP + '"a": 1 %%{ !\n'.repeat(n / 13)],
  ['directive closers that fail', (n) => TREEMAP + '"a": 1 %%{' + '}%%x'.repeat(n / 4)],
  ['CRLF rows', (n) => 'treemap\r\n' + '"a": 1\r\n'.repeat(n / 8)],
  ['entities in names', (n) => TREEMAP + '"' + '#a;'.repeat(n / 3) + '": 1'],
  ['style separators', (n) => TREEMAP + '"a":::'.repeat(n / 6)],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  const t0 = cpuMs();
  run();
  return cpuMs() - t0;
};

describe('stress: the treemap lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, scale = 1) => {
      const small = build(4_000 * scale);
      const large = build(32_000 * scale);
      treemapTokens(small); // warm up
      treemapTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => treemapTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => treemapTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});

/**
 * Pitfall 19: the layout does no per-node rework (no scan of the siblings or the children per
 * row), so it is linear in the rows, give or take d3's sort. Pie's pattern: n and 8n rows, best
 * of five, CPU time, `tLarge / Math.max(tSmall, 2) < 24` (linear ~8x, quadratic ~64x). The
 * models are built, not parsed, so only the layout is timed. Not measured on a steady machine.
 */
const LONG = 'a label far too long for any box it could get '.repeat(8);
let ids = 0;
const leaf = (name: string, value: number): TreemapNode => ({
  type: 'Leaf',
  name,
  value,
  depth: 0,
  children: [],
  astId: `node:${++ids}`,
});
const section = (name: string, children: TreemapNode[]): TreemapNode => ({
  type: 'Section',
  name,
  depth: 0,
  children,
  astId: `node:${++ids}`,
});
const forest = (roots: TreemapNode[]): TreemapModel => ({
  roots,
  classes: [],
  accTitle: '',
  accDescr: '',
  warnings: [],
});
const rows = (n: number, name: (i: number) => string = (i) => `n${i % 97}`) =>
  Array.from({ length: n }, (_, i) => leaf(name(i), 1 + (i % 13)));

/**
 * `[name, build, config, scale]`: `build(n)` is a model of about `n` rows, laid out at 2k and
 * 16k rows times `scale` (a quadratic leaf scan fails at those sizes, not at 8× fewer). Long
 * labels cost a measure per character, so that shape runs at an eighth. Its canvas grows with
 * the square root of the rows, so both sizes give boxes of one size: the label fitting and
 * truncation then do the same work per row, and only the row count differs.
 */
const LAYOUTS: [
  name: string,
  build: (n: number) => TreemapModel,
  config?: (n: number) => Record<string, unknown>,
  scale?: number,
][] = [
  ['flat leaves', (n) => forest(rows(n))],
  ['one section of leaves', (n) => forest([section('s', rows(n))])],
  ['equal values', (n) => forest(Array.from({ length: n }, (_, i) => leaf(`n${i}`, 1)))],
  [
    'deep sections',
    (n) => {
      let node = leaf('x', 1);
      for (let i = 0; i < n / 2; i++) node = section(`s${i % 7}`, [node, leaf('y', 1)]);
      return forest([node]);
    },
  ],
  [
    'sections of ten, many names',
    (n) =>
      forest(
        Array.from({ length: n / 10 }, (_, i) =>
          section(
            `s${i}`,
            rows(9, (j) => `${i}.${j}`)
          )
        )
      ),
  ],
  [
    'complex, long labels truncated',
    (n) =>
      forest(
        Array.from({ length: n / 10 }, (_, i) =>
          section(
            `${i} ${LONG}`,
            rows(9, (j) => `${j} ${LONG}`)
          )
        )
      ),
    (n) => {
      const side = Math.round(3000 * Math.sqrt(n / 2_000));
      return { nodeWidth: side, nodeHeight: side };
    },
    1 / 8,
  ],
];

let theme: Theme;
beforeAll(async () => {
  theme = await treemapTestTheme();
});

describe('stress: the treemap layout is linear in rows', () => {
  it.each(LAYOUTS)(
    '%s',
    (name, build, config = () => ({}), scale = 1) => {
      const [nSmall, nLarge] = [2_000 * scale, 16_000 * scale];
      const small = build(nSmall);
      const large = build(nLarge);
      const ctxSmall = treemapTestContext(theme, config(nSmall));
      const ctxLarge = treemapTestContext(theme, config(nLarge));
      const laySmall = () => layoutTreemap(small, ctxSmall);
      const layLarge = () => layoutTreemap(large, ctxLarge);
      const cut = (layout: TreemapLayout) =>
        layout.sections.filter((s) => s.label?.text.endsWith('...')).length;
      const smallCut = cut(laySmall()); // also the warm-up
      const largeCut = cut(layLarge());
      if (name.startsWith('complex')) {
        expect(smallCut).toBeGreaterThan(10);
        expect(largeCut).toBeGreaterThan(100);
      }
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(tSmall, cost(laySmall));
        tLarge = Math.min(tLarge, cost(layLarge));
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );
});
