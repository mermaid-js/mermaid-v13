import { describe, expect, it } from 'vitest';
import { parseBlock } from '@mermaid-js/diagram-block';

/**
 * R-PARSE-7, pitfall 5 and 11: the block parser, model, AST and warnings included, is linear in
 * statements and in nesting depth, where v12's grammar was quadratic (`[$1].concat($2)`). Same
 * frame as venn's `parser-stress.spec.ts`: n and 8n statements (2k and 16k; nesting shapes nest
 * that deep, past the 800 levels asked), best of five, bar 24x (linear ~8x, quadratic ~64x). The limits are raised so the large inputs
 * are read in full. Not measured on a steady machine: the bar is a ratio.
 */
const B = 'block\n';
const LIMITS = { maxNodes: 1e9, maxEdges: 1e9, maxDepth: 1e9 };
const ids = (n: number, p = 'b') => Array.from({ length: n }, (_, k) => `${p}${k}`);

/** Each shape builds a diagram of `n` statements (or `n` nesting levels). */
const SHAPES: [string, (n: number) => string][] = [
  ['distinct blocks', (n) => B + ids(n).join('\n')],
  ['the same block again and again', (n) => B + 'a["x"]\n'.repeat(n)],
  [
    'edges between distinct blocks',
    (n) =>
      B +
      ids(n)
        .map((id) => `${id} --> a`)
        .join('\n'),
  ],
  ['parallel edges', (n) => B + 'a -- "l" --> b\n'.repeat(n)],
  ['one long chain', (n) => B + ids(n).join(' --> ')],
  ['statements on one line', (n) => B + ids(n).join(' ')],
  ['nested composites', (n) => B + 'block\n'.repeat(n) + 'a\n' + 'end\n'.repeat(n)],
  [
    'nested composites with ids',
    (n) =>
      B +
      ids(n, 'g')
        .map((g) => `block:${g}\n`)
        .join('') +
      'a\n' +
      'end\n'.repeat(n),
  ],
  [
    'sibling composites',
    (n) =>
      B +
      ids(n)
        .map((id) => `block:g${id}\n ${id}\nend`)
        .join('\n'),
  ],
  [
    'one composite reopened',
    (n) =>
      B +
      ids(n)
        .map((id) => `block:g\n ${id}\nend`)
        .join('\n'),
  ],
  ['spaces', (n) => B + 'space:3\n'.repeat(n)],
  ['columns', (n) => B + 'columns 3\n'.repeat(n)],
  [
    'classes for later blocks',
    (n) =>
      B +
      ids(n)
        .map((id) => `class ${id} c`)
        .join('\n') +
      '\n' +
      ids(n).join(' '),
  ],
  [
    'one class line over many blocks',
    (n) => B + ids(n).join(' ') + `\nclass ${ids(n).join(',')} c`,
  ],
  [
    'styles before their blocks',
    (n) =>
      B +
      ids(n)
        .map((id) => `style ${id} fill:red`)
        .join('\n') +
      '\n' +
      ids(n).join(' '),
  ],
  [
    'styles of unknown blocks',
    (n) =>
      B +
      ids(n)
        .map((id) => `style ${id} fill:red`)
        .join('\n') +
      '\na',
  ],
  [
    'classDefs',
    (n) =>
      B +
      ids(n)
        .map((id) => `classDef ${id} fill:red,color:blue`)
        .join('\n'),
  ],
  // One statement each, so no n block statements hide the cost of reading its list.
  ['one long style id list', (n) => B + 'a\nstyle ' + ids(n).join(',') + ' fill:red'],
  ['one long class id list', (n) => B + 'a\nclass ' + Array<string>(n).fill('a').join(',') + ' c'],
  ['many class-name words', (n) => B + 'a\nclass a ' + ids(n).join(' ')],
  ['a self chain', (n) => B + Array<string>(n).fill('a').join(' --> ')],
  ['empty composites', (n) => B + 'block\nend\n'.repeat(n)],
  ['a quoted text on every line', (n) => B + '"x"\n'.repeat(n)],
  [
    'zero spans',
    (n) =>
      B +
      ids(n)
        .map((id) => `${id}:0`)
        .join('\n'),
  ],
  ['a syntax error on every line', (n) => B + 'a:x\n'.repeat(n)],
  ['an unquoted label on every line', (n) => B + 'a[x]\n'.repeat(n)],
  ['an end too many on every line', (n) => B + 'end\n'.repeat(n)],
  ['composites left open', (n) => B + 'block\na\n'.repeat(n)],
];

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

describe('stress: the block parser is linear in statements and depth', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(2_000);
      const large = build(16_000);
      const run = (src: string) => parseBlock(src, LIMITS);
      run(small); // warm up
      run(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => run(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => run(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );

  it('parses 16k statements and depth 800 in full', () => {
    const flat = parseBlock(B + ids(16_000).join('\n'), LIMITS);
    expect(flat.diagnostics).toEqual([]);
    expect(flat.model.blocks).toHaveLength(16_000);
    const deep = parseBlock(B + 'block\n'.repeat(800) + 'a\n' + 'end\n'.repeat(800), LIMITS);
    expect(deep.diagnostics).toEqual([]);
    let depth = 0;
    for (let b = deep.model.blocks[0]; b; b = b.children[0]) depth++;
    expect(depth).toBe(801);
  });
});
