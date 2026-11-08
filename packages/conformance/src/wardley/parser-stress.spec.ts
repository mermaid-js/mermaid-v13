import { describe, expect, it } from 'vitest';
import { parseWardley } from '@mermaid-js/diagram-wardley';

/**
 * R-PARSE-7, pitfall 5 and 11: the wardley parser, value conversion and model population
 * included, is linear in input size. v12's builder resolved each link end by a scan over the
 * nodes' labels; here it is one lookup, as are merges, trends and pipelines by parent. Same
 * frame as `stress.spec.ts`: each shape at `n` and `8n` units, `n` picked so the small parse
 * costs a few ms here, best of five, bar 24x (linear ~8x, quadratic ~64x), CPU time. Not
 * measured on a steady machine: the bar is a ratio.
 */
const lines = (n: number, line: (k: number) => string) =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n');
const W = 'wardley-beta\n';

const SHAPES: [string, (n: number) => string, number][] = [
  ['many components', (n) => W + lines(n, (k) => `component C${k} [0.5, 0.5]`), 800],
  [
    'links to pipeline components by label',
    // Large enough that a scan per link end (v12's) shows over the linear part.
    (n) =>
      `${W}component P [0.5, 0.5]\npipeline P {\n${lines(n, (k) => `  component c${k} [0.5]`)}\n}\n` +
      lines(n, (k) => `c${k} -> P`),
    2_000,
  ],
  ['links to unknown names', (n) => W + lines(n, (k) => `A${k} -> B${k}`), 800],
  [
    'one component merged many times',
    (n) => W + lines(n, (k) => `component A [0.5, 0.5]${k % 2 ? ' label [1, 2]' : ''}`),
    800,
  ],
  [
    'many evolves of a few components',
    (n) =>
      `${W}component A [0.5, 0.5]\ncomponent B [0.5, 0.5]\n` +
      lines(n, (k) => `evolve ${k % 2 ? 'A' : 'B'} 0.7`),
    1_500,
  ],
  [
    'a pipeline replaced many times',
    (n) =>
      `${W}component P [0.5, 0.5]\n` + lines(n, (k) => `pipeline P {\n  component c${k} [0.5]\n}`),
    500,
  ],
  ['an error on every line', (n) => W + lines(n, () => 'component A [1, 0.5]'), 800],
  ['a range error on every line', (n) => W + lines(n, (k) => `component C${k} [0.5, 150.0]`), 700],
  [
    'an ambiguous coordinate on every line',
    (n) => W + lines(n, (k) => `note "n${k}" [1.5, 0.5]`),
    1_000,
  ],
  [
    'an unclosed pipeline over many lines',
    (n) =>
      `${W}component P [0.5, 0.5]\npipeline P {\n` + lines(n, (k) => `  component c${k} [0.5]`),
    700,
  ],
  [
    'an unclosed accDescr over many lines',
    (n) => `${W}accDescr {\n` + lines(n, (k) => `  text ${k} -> more`),
    900,
  ],
  [
    'a long name of many words',
    (n) => `${W}component ${lines(n, (k) => `w${k}`).replace(/\n/g, ' ')} [0.5, 0.5]`,
    3_000,
  ],
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

describe('stress: the wardley parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      parseWardley(small); // warm up
      parseWardley(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseWardley(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseWardley(large))
        );
      }
      if (process.env.WARDLEY_STRESS_LOG) {
        process.stdout.write(`${_name}: ${tSmall.toFixed(1)} ms, ${tLarge.toFixed(1)} ms\n`);
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
