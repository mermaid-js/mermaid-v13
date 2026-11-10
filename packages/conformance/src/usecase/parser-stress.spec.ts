import { describe, expect, it } from 'vitest';
import { parseUsecase } from '@mermaid-js/diagram-usecase';

/**
 * R-PARSE-7, pitfall 5 and 11: the usecase parser, model builder and JSON reader included, is
 * linear in input size. v12's labelled-arrow lookahead (`hasLabeledRight`) scanned ahead from
 * every `--`; here each run of label tokens is scanned once. The `--` runs and `<<` lines of the
 * lexer's stress spec are repeated on the parser (#562's GAPS), with a fan-out of many relations
 * from one actor and into one use case, a large boundary, many classes on one element and a
 * JSON object whose keys repeat. Same frame as `stress.spec.ts`: each shape at `n` and `8n`
 * units, `n` picked so the small parse costs a few ms here, best of five, bar 24x (linear ~8x,
 * quadratic ~64x), CPU time. Not measured on a steady machine: the bar is a ratio.
 */
const lines = (n: number, line: (k: number) => string) =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n');
const H = 'usecase-beta\n';

const SHAPES: [string, (n: number) => string, number][] = [
  ['runs of --', (n) => H + 'A ' + '-- '.repeat(n * 10) + 'B', 1_000],
  ['labelled arrows', (n) => H + lines(n, (k) => `A${k % 50} -- label --> B${k % 50}`), 1_000],
  ['one long label', (n) => H + 'A -- ' + 'x '.repeat(n * 10) + '--> B', 1_000],
  ['labels with no closing arrow', (n) => H + lines(n, () => `A -- ${'x '.repeat(40)}`), 200],
  ['a label of single dashes', (n) => H + 'A <-- ' + 'x - '.repeat(n * 5) + '-- B', 1_000],
  ['dashes between labels', (n) => H + 'A ' + '-- x '.repeat(n * 5) + 'B', 1_000],
  ['lines of << without >>', (n) => H + lines(n, () => 'A <<x'), 1_000],
  ['stereotypes', (n) => H + lines(n, (k) => `U${k} <<s>>`), 1_000],
  ['fan-out from one actor', (n) => `${H}actor A\n` + lines(n, (k) => `A --> U${k}`), 1_000],
  ['fan-in to one use case', (n) => H + lines(n, (k) => `actor A${k} --> U`), 1_000],
  [
    'a boundary with many members',
    (n) => `${H}systemBoundary S\n${lines(n, (k) => `  U${k}`)}\nend`,
    4_000,
  ],
  [
    'many classes on one element',
    (n) => `${H}U(label)\n` + lines(n, (k) => `class U c${k}`),
    4_000,
  ],
  ['one element declared many times', (n) => H + lines(n, (k) => `U(label):::c${k}`), 4_000],
  ['boundaries nested deep', (n) => H + lines(n, () => 'systemBoundary S'), 1_000],
  ['an error on every line', (n) => H + lines(n, () => 'A B'), 1_000],
  ['a model error on every line', (n) => H + lines(n, (k) => `note for G${k} "x"`), 1_000],
  [
    'metadata over many lines',
    (n) => `${H}actor A@{\n${lines(n, (k) => `  key${k}: value`)}\n}`,
    1_000,
  ],
  [
    'JSON whose keys repeat',
    (n) => `${H}json P@{${lines(n, (k) => `"k${k}": {},`)}${'"a": {"b": [{}]}, '.repeat(n)}"z": 1}`,
    2_000,
  ],
  ['JSON with many keys', (n) => `${H}json P@{${lines(n, (k) => `"k${k}": {},`)}"z": 1}`, 1_000],
  ['an unclosed accDescr {', (n) => `${H}accDescr {\n${lines(n, (k) => `text ${k}`)}`, 1_000],
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

describe('stress: the usecase parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      parseUsecase(small); // warm up
      parseUsecase(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseUsecase(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseUsecase(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );
});
