import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutEventModel,
  parseEventModel,
  type EventModel,
} from '@mermaid-js/diagram-eventmodeling';
import {
  eventModelTestContext,
  eventModelTestTheme,
} from '@mermaid-js/diagram-eventmodeling/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-LAYOUT-3, pitfall 5: the event modeling layout (#604) is linear in the number of frames,
 * lanes, relations and data lines. The same frame as `parser-stress.spec.ts`: each model at `n`
 * and `8n` units (parsed outside the timing), laid out with the table measurer,
 * bar 24x (linear ~8x, quadratic ~64x), timed with `linearRatio` (`../linear-time.ts`). Not measured on a steady machine: the bar is a
 * ratio.
 */
const lines = (n: number, line: (k: number) => string) =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n');
const H = 'eventmodeling\n';
const fid = (k: number) => String(k % 1000).padStart(3, '0');

const SHAPES: [string, (n: number) => string, number][] = [
  ['many frames in one lane', (n) => H + lines(n, (k) => `tf ${fid(k)} evt E${k}`), 2_000],
  [
    'many frames, lanes alternating',
    (n) => H + lines(n, (k) => `tf ${fid(k)} ${['ui', 'cmd', 'evt'][k % 3]} F${k}`),
    2_000,
  ],
  ['many namespace lanes', (n) => H + lines(n, (k) => `tf ${fid(k)} cmd N${k}.C`), 2_000],
  [
    'a source on every frame',
    (n) => H + lines(n, (k) => `tf ${fid(k)} ${k % 2 ? 'cmd' : 'evt'} F${k} ->> ${fid(k + 999)}`),
    2_000,
  ],
  [
    'a large data block',
    (n) => `${H}tf 01 evt A [[D]]\ndata D {\n${lines(n, (k) => `    line ${k} of the data`)}\n}`,
    6_000,
  ],
  ['a long name', (n) => `${H}tf 01 evt ${lines(n, (k) => `p${k}`).replace(/\n/g, '_')}`, 3_000],
];

let theme: Theme;
beforeAll(async () => {
  theme = await eventModelTestTheme();
});

describe('stress: the event modeling layout is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const ctx = eventModelTestContext(theme);
      const layoutOf = (m: EventModel) => layoutEventModel(m, ctx);
      const small = parseEventModel(build(n)).model;
      const large = parseEventModel(build(8 * n)).model;
      expect(
        linearRatio(
          () => layoutOf(small),
          () => layoutOf(large),
          process.env.EVENTMODELING_STRESS_LOG ? _name : undefined
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
