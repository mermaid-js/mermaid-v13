import { beforeAll, describe, expect, it } from 'vitest';
import type { RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import { pxProfile } from '@mermaid-js/core/layout';
import { streamWriter } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { c4, layoutC4, type C4Layout, type C4Model } from '@mermaid-js/diagram-c4';
import { c4TestContext, parsedC4 } from '@mermaid-js/diagram-c4/testing';
import { cost, MIN_MS, repeatsFor } from './timing.ts';

/**
 * The C4 renderer is linear in the diagram's size (spec #522 T4, pitfall 19): it paints what
 * the layout placed, each element, boundary and relation once, and checks each colour once.
 * Shape from `./stress.spec.ts` (#531): n and 8n elements; linear is ~8x, quadratic ~64x, and the
 * bar is 24x. Times are this thread's CPU time, best of five, of the render alone (each source
 * parsed and laid out once), the small render repeated until it takes at least `MIN_MS`. Not
 * measured on a steady machine.
 */
const C = 'C4Context\n';
const SHAPES: [string, (n: number) => string, number][] = [
  [
    'elements in boundaries, styled, related to the next',
    (n) => {
      let s = C;
      for (let b = 0; b < n / 10; b++) {
        s += `Boundary(b${b}, "B${b}", "kind", $descr="about b${b}") {\n`;
        for (let i = 0; i < 10; i++)
          s += `ContainerDb(c${b}_${i}, "C${i}", "SQL", "about c${b}_${i}")\n`;
        s += '}\n';
      }
      for (let i = 0; i < n; i++) {
        const [b, k] = [Math.floor(i / 10), i % 10];
        s += `Rel(c${b}_${k}, c${b}_${(k + 1) % 10}, "next", "HTTP")\n`;
        s += `UpdateElementStyle(c${b}_${k}, $bgColor="#ff${String(k).padStart(4, '0')}")\n`;
      }
      return s;
    },
    500,
  ],
  [
    'elements of every shape, unrelated',
    (n) => {
      const macros = ['Person', 'System', 'SystemDb', 'SystemQueue', 'Component'];
      let s = C;
      for (let i = 0; i < n; i++) s += `${macros[i % 5]}(e${i}, "E${i}", "d${i}")\n`;
      return s;
    },
    1_000,
  ],
];

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'), { diagram: c4.theme });
});

describe('stress: the C4 renderer is linear in diagram size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const prepare = (src: string): [C4Model, C4Layout, RenderContext] => {
        const { model, config } = parsedC4(src);
        const ctx: RenderContext = {
          ...c4TestContext(config, theme),
          limits: resolveLimits(config),
          units: pxProfile,
          securityLevel: 'default',
          idPrefix: 'm',
          version: '0',
          layout: () => {
            throw new Error('custom');
          },
          warn: () => undefined,
        };
        return [model, layoutC4(model, { ...ctx, measurer: tableMeasurer }), ctx];
      };
      const small = prepare(build(n));
      const large = prepare(build(8 * n));
      const draw = ([model, layout, ctx]: [C4Model, C4Layout, RenderContext]): string => {
        const w = streamWriter({});
        c4.render(model, layout, ctx, w);
        return w.finish();
      };
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
    120_000
  );
});
