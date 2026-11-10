import { describe, expect, it } from 'vitest';
import { parseGitGraph } from '@mermaid-js/diagram-gitgraph';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the gitGraph parser and model builder are linear in input size. Same
 * frame as `stress.spec.ts`: n and 8n units, best of five, bar 24x (linear ~8x, quadratic
 * ~64x). Not measured on a steady machine: the bar is a ratio.
 */
const lines = (n: number, per: number, line: (k: number) => string) =>
  'gitGraph\n' + Array.from({ length: Math.floor(n / per) }, (_, k) => line(k)).join('\n');

const SHAPES: [string, (n: number) => string][] = [
  ['commits with derived ids', (n) => lines(n, 7, () => 'commit')],
  ['commits with written ids', (n) => lines(n, 16, (k) => `commit id:"c${k}"`)],
  ['one id repeated', (n) => lines(n, 14, () => 'commit id:"a"')],
  ['many branches', (n) => lines(n, 20, (k) => `branch b${k}\ncommit`)],
  ['many ordered branches', (n) => lines(n, 28, (k) => `branch b${k} order:${k % 7}\ncommit`)],
  [
    'merges back and forth',
    (n) =>
      'gitGraph\ncommit\nbranch a\n' +
      lines(n, 44, () => 'commit\ncheckout main\ncommit\nmerge a\ncheckout a').slice(9),
  ],
  [
    'cherry-picks',
    (n) =>
      'gitGraph\ncommit\nbranch a\n' +
      lines(
        n,
        60,
        (k) => `checkout a\ncommit id:"p${k}"\ncheckout main\ncherry-pick id:"p${k}"`
      ).slice(9),
  ],
  ['tags on one commit', (n) => `gitGraph\ncommit${' tag:"t"'.repeat(n / 8)}`],
  ['escapes in a message', (n) => `gitGraph\ncommit msg:"${'\\n'.repeat(n / 2)}"`],
  ['an error on every line', (n) => lines(n, 12, () => 'commit oops')],
  ['a DB error on every line', (n) => lines(n, 13, () => 'checkout nope')],
  ['blanks inside an accDescr block line', (n) => `gitGraph\naccDescr {a${' '.repeat(n)}b}`],
  ['blank runs in a title', (n) => `gitGraph\ntitle a${'  b'.repeat(n / 3)}`],
];

describe('stress: the gitGraph parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parseGitGraph(small),
          () => parseGitGraph(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
