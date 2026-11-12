import { describe, expect, it } from 'vitest';
import { unicode } from '@mermaid-js/core/ascii';
import type { C4Layout } from '@mermaid-js/diagram-c4';
import { c4AsciiDrawing } from '@mermaid-js/diagram-c4/testing';
import { renderC4Ascii } from './ascii-render.ts';
import { cost, MIN_MS, repeatsFor } from './timing.ts';

/**
 * The C4 text drawing is bounded (#545, R-SEC-5, D542): it routes each relation on the grid and
 * places each label within a budget of search steps and label cells, so past it the drawing is
 * linear in the diagram's size. Shape from `./stress.spec.ts` (#531): n and 8n elements; linear
 * is ~8x, quadratic ~64x, and the bar is 24x. Every shape spends the budget at both sizes, as
 * `layout-stress.spec.ts`'s first shapes do: below it a drawing costs what its searches cost,
 * up to the budget's (about a second here for the hub at 8n). Times are this thread's CPU time,
 * best of five, of the drawing alone (`c4AsciiDrawing` on the cell layout the API ran), the small
 * drawing repeated until it takes at least `MIN_MS`. Not measured on a steady machine.
 */
const C = 'C4Context\n';
const LONG = 'sends a long and wordy description of what it does to';
const SHAPES: [string, (n: number) => string, number][] = [
  [
    'long labels, each element related to the next',
    (n) => {
      let s = C;
      for (let i = 0; i < n; i++)
        s += `System(s${i}, "S${i}")\nRel(s${i}, s${(i + 1) % n}, "${LONG} s${i}", "a long technology")\n`;
      return s;
    },
    40,
  ],
  [
    'many relations',
    (n) => {
      let s = C;
      for (let i = 0; i < n; i++) s += `System(s${i}, "S${i}")\n`;
      for (let i = 0; i < n; i++)
        for (const k of [1, 5, 11]) s += `Rel(s${i}, s${(i + k) % n}, "r${i}_${k}")\n`;
      return s;
    },
    40,
  ],
  [
    'a hub every element relates to',
    (n) => {
      let s = C + 'System(hub, "Hub")\n';
      for (let i = 0; i < n; i++) s += `System(s${i}, "S${i}")\nRel(s${i}, hub, "uses ${i}")\n`;
      return s;
    },
    40,
  ],
];

/**
 * #689: the drawing is linear in the length of one text too. n and 8n characters in a relation's
 * label (one word, short words, and wrapped by the layout with root `wrap` and `c4.wrap`), an
 * element's name, a boundary's label and the title, between two elements; the same measure and
 * bar as above.
 */
const WRAP = '%%{init: {"wrap": true, "c4": {"wrap": true}}}%%\n';
const two = (rest: string, head = ''): string =>
  `${head}${C}System(a, "A")\nSystem(b, "B")\n${rest}\n`;
const TEXTS: [string, (n: number) => string, number][] = [
  ['a relation label of one long word', (n) => two(`Rel(a, b, "${'x'.repeat(n)}")`), 2_000],
  ['a relation label of short words', (n) => two(`Rel(a, b, "${'xxxx '.repeat(n / 5)}")`), 2_000],
  [
    'a wrapped relation label of short words',
    (n) => two(`Rel(a, b, "${'xxxx '.repeat(n / 5)}")`, WRAP),
    2_000,
  ],
  [
    'a wrapped relation label of one long word',
    (n) => two(`Rel(a, b, "${'x'.repeat(n)}")`, WRAP),
    2_000,
  ],
  [
    'a long relation label and technology',
    (n) => two(`Rel(a, b, "${'x'.repeat(n / 2)}", "${'y'.repeat(n / 2)}")`),
    2_000,
  ],
  ['a long element name', (n) => two(`System(c, "${'x'.repeat(n)}")\nRel(a, c, "r")`), 2_000],
  [
    'a long boundary label',
    (n) => `${C}Boundary(g, "${'x'.repeat(n)}") {\nSystem(a, "A")\n}\n`,
    2_000,
  ],
  ['a long title', (n) => two(`Rel(a, b, "r")\ntitle ${'x'.repeat(n)}`), 2_000],
];

describe.each([
  ['diagram size past its budget', SHAPES],
  ['the length of one text (#689)', TEXTS],
])('stress: the C4 text drawing is linear in %s', (_what, shapes) => {
  it.each(shapes)(
    '%s',
    async (_name, build, n) => {
      const small = (await renderC4Ascii(build(n), 'unicode')).layout;
      const large = (await renderC4Ascii(build(8 * n), 'unicode')).layout;
      const draw = (layout: C4Layout): string => c4AsciiDrawing(layout, unicode).text;
      draw(large); // warm up
      const reps = repeatsFor(() => draw(small));
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => draw(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => draw(large), repsLarge)
        );
      }
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    300_000
  );
});
