import { describe, expect, it } from 'vitest';
import { parseC4Beta } from '@mermaid-js/diagram-c4/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the c4-beta parser, model building included, is linear in input size.
 * Each shape is parsed at n and 8n units; linear is about 8x, quadratic about 64x, and the bar
 * is 24x. Times are CPU times (`linearRatio`), so the bar is a ratio, never a time.
 */
const H = 'c4-beta container\n';
const lines = (n: number, line: (k: number) => string): string =>
  H + Array.from({ length: n }, (_, k) => line(k)).join('\n');
/** `n` groups, each in the body of the one before, with their bodies left open. */
const nested = (n: number): string => lines(n, (k) => `group g${k} "G" {`) + '\n';
const NO_LIMITS = { maxNodes: Infinity, maxEdges: Infinity, maxDepth: Infinity };

const SHAPES: [string, (n: number) => string][] = [
  ['one long id', (n) => `${H}person ${'a'.repeat(n)} "A"\n${'a'.repeat(n)} --> ${'a'.repeat(n)}`],
  ['one long hyphenated id', (n) => `${H}person ${'a-'.repeat(n / 2)}b "A"`],
  ['a long string', (n) => `${H}person a "${'x\\"'.repeat(n / 3)}"`],
  ['an unclosed string', (n) => `${H}person a "${'x'.repeat(n)}`],
  ['a long title', (n) => `${H}title ${'x '.repeat(n / 2)}`],
  ['a long run of blanks', (n) => `${H}person a${' '.repeat(n)}"A"`],
  ['elements with distinct ids', (n) => lines(n / 12, (k) => `person p${k} "P ${k}"`)],
  ['one id repeated (duplicates)', (n) => lines(n / 14, (k) => `person a "A ${k}"`)],
  [
    'relations between distinct pairs',
    (n) =>
      lines(n / 24, (k) => (k % 2 ? `p${k - 1} --> p${(k * 7) % k} : "r"` : `person p${k} "P"`)),
  ],
  ['one relation repeated', (n) => `${H}person a "A"\n${'a --> a : "r" "t"\n'.repeat(n / 18)}`],
  ['relations to unknown ids', (n) => `${H}person a "A"\n${'a --> x : "r"\n'.repeat(n / 14)}`],
  ['steps on every relation', (n) => `${H}person a "A"\n${'2: a --> a\n'.repeat(n / 11)}`],
  ['bodies side by side', (n) => lines(n / 40, (k) => `group g${k} "G" {\n  person p${k} "P"\n}`)],
  ['bodies nested deep', (n) => `${nested(n / 16)}${'}\n'.repeat(n / 16)}`],
  ['unclosed bodies nested deep', (n) => nested(n / 16)],
  ['many tags on one element', (n) => `${H}person a "A"${' :::t'.repeat(n / 5)}`],
  ['many style entries', (n) => `${H}style a${' fill:red,'.repeat(n / 10)} fill:red`],
  [
    'titles and accessibility',
    (n) => lines(n / 12, (k) => (k % 2 ? `title T${k}` : `accDescr: D${k}`)),
  ],
  ['unclosed accDescr blocks', (n) => lines(n / 11, () => 'accDescr {')],
  ['an error on every line', (n) => lines(n / 12, () => 'person p')],
  ['a stray brace on every line', (n) => lines(n / 2, () => '}')],
  ['bad characters on every line', (n) => lines(n / 8, () => 'person ; ;')],
  ['comment lines between statements', (n) => lines(n / 17, (k) => `person p${k} "P"\n%% c`)],
];

describe('stress: the c4-beta parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(8_000);
      const large = build(64_000);
      expect(
        linearRatio(
          () => parseC4Beta(small, NO_LIMITS),
          () => parseC4Beta(large, NO_LIMITS)
        )
      ).toBeLessThan(24);
    },
    60_000
  );

  it('parses a deep nesting without growing the call stack', () => {
    const depth = 20_000;
    const r = parseC4Beta(`${nested(depth)}${'}\n'.repeat(depth)}`, NO_LIMITS);
    expect(r.diagnostics).toEqual([]);
    expect(r.model.elements).toHaveLength(depth);
    expect(r.model.elements[depth - 1]?.parent).toBe(`g${depth - 2}`);
  });
});
