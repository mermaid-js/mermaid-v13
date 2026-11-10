import { describe, expect, it } from 'vitest';
import { eventModelStructure, parseEventModel } from '@mermaid-js/diagram-eventmodeling';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5 and 11: the event modeling parser, value conversion, D525's warnings and
 * the lanes, boxes and relations (`eventModelStructure`) are linear in input size. v12 found a
 * frame's inferred source by scanning back box by box, and its sources by filtering every frame;
 * here each is a lookup. Same frame as `stress.spec.ts`: each shape at `n` and `8n` units, `n`
 * picked so the small parse costs a few ms here, bar 24x (linear ~8x, quadratic ~64x), timed
 * with `linearRatio` (`../linear-time.ts`). Not measured on a steady machine: the bar is a ratio.
 */
const lines = (n: number, line: (k: number) => string) =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n');
const H = 'eventmodeling\n';
/** A distinct three-digit frame id for `k` below 1000, a repeated one after. */
const fid = (k: number) => String(k % 1000).padStart(3, '0');

const SHAPES: [string, (n: number) => string, number][] = [
  // One lane: v12's backwards scan for the inferred source went to the first frame each time.
  ['many frames in one lane', (n) => H + lines(n, (k) => `tf ${fid(k)} evt E${k}`), 3_000],
  [
    'many frames, lanes alternating',
    (n) => H + lines(n, (k) => `tf ${fid(k)} ${k % 2 ? 'cmd' : 'evt'} F${k}`),
    120,
  ],
  [
    'one frame with many sources',
    (n) => `${H}tf 001 cmd A\ntf 002 evt B ${lines(n, (k) => `->> ${fid(k)}`).replace(/\n/g, ' ')}`,
    1_500,
  ],
  ['many namespaces', (n) => H + lines(n, (k) => `tf ${fid(k)} cmd N${k}.C`), 120],
  [
    'many references to many data blocks',
    (n) =>
      H +
      lines(Math.min(n, 999), (k) => `tf ${fid(k)} evt E [[D${k}]]`) +
      '\n' +
      lines(n, (k) => `data D${k} {\n  v: ${k}\n}`),
    120,
  ],
  ['a duplicate id on every line', (n) => H + lines(n, (k) => `tf 01 evt E${k}`), 800],
  ['an error on every line', (n) => H + lines(n, () => 'tf 01 evt text'), 800],
  [
    'a keyword name inside every line',
    (n) => `${H}${lines(n, (k) => `tf 01 cmd data ${k}`).replace(/\n/g, ' ')}`,
    800,
  ],
  [
    'many gwt steps',
    (n) => `${H}tf 01 evt A\ngwt 01 given ${lines(n, (k) => `evt S${k}`)} then evt A`,
    1_500,
  ],
  [
    'a long qualified name',
    (n) => `${H}tf 01 evt ${lines(n, (k) => `p${k}`).replace(/\n/g, '.')}`,
    3_000,
  ],
  [
    'a large data block',
    (n) => `${H}tf 01 evt A [[D]]\ndata D {\n${lines(n, (k) => `    line ${k}`)}\n}`,
    3_000,
  ],
  [
    'unknown sources and notes on unknown frames',
    (n) => H + lines(n, (k) => `tf ${fid(k)} evt E ->> 999\nnote 998 {\n  x\n}`),
    120,
  ],
];

const parseAll = (src: string) => eventModelStructure(parseEventModel(src).model);

describe('stress: the event modeling parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      expect(
        linearRatio(
          () => parseAll(small),
          () => parseAll(large),
          process.env.EVENTMODELING_STRESS_LOG ? _name : undefined
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
