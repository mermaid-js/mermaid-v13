/**
 * R-THEME-9 for ER's own fills (spec #795 T3): what the ER renderer draws on its rows and
 * relationship labels reads in each classic theme. Core's `themes.spec.ts` checks the shared
 * variables; ER's resolve only with its table (D331). Pairs are `[ink, fill, min]`, as in T5's
 * `theme-contrast.spec.ts` (`PAIRS`), so they can move there under an `er:` key. A fill with
 * alpha is judged composited over `background`, as drawn.
 */
import {
  composite,
  contrastRatio,
  createTheme,
  loadTheme,
  type Rgba,
} from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_TABLES } from './diagram-themes.ts';

const CLASSIC = ['default', 'dark', 'forest', 'neutral', 'base'] as const;

const TEXT = 4.5;

/** An ink drawn on a fill, and the ratio it needs. */
type Pair = readonly [ink: string, fill: string, min: number];

/** Checked with each theme's own colours. */
const PAIRS: Readonly<Record<string, readonly Pair[]>> = {
  // #799 (#758, #761): attribute text on each row, and the relationship label on its fill.
  er: [
    ['erRowOddTextColor', 'rowOdd', TEXT],
    ['erRowEvenTextColor', 'rowEven', TEXT],
    ['textColor', 'erEdgeLabelBackground', TEXT],
  ],
};

/**
 * Pairs whose ink a rule picks against the fill, so they also hold under these `themeVariables`.
 * The ER label text is `textColor` on `tertiaryColor` at half opacity, as v12: an author's
 * `tertiaryColor` can take it below AA, so it is not probed.
 */
const PROBED: Readonly<
  Record<string, { pairs: readonly Pair[]; probes: readonly Readonly<Record<string, string>>[] }>
> = {
  er: {
    pairs: PAIRS.er!.slice(0, 2),
    probes: [
      { primaryColor: '#335577' },
      { primaryColor: '#000000' },
      { primaryColor: '#ffffff' },
      // A dark primaryColor under a pinned light entity fill: dark rows, light header.
      { primaryColor: '#000000', mainBkg: '#ececff' },
      { tertiaryColor: '#ff00ff' },
    ],
  },
};

const specs = await Promise.all(CLASSIC.map((n) => loadTheme(n)));

describe('ER inks on ER fills in the classic themes (R-THEME-9, spec #795)', () => {
  it.each(specs.map((s) => [s.name, s] as const))('%s', (_name, spec) => {
    const failures: string[] = [];
    const check = (type: string, pairs: readonly Pair[], themeVariables = {}) => {
      const t = createTheme(spec, {
        diagram: DIAGRAM_TABLES[type],
        themeVariables,
        cssVariables: false,
      });
      const bg = t.rgba('background') as Rgba;
      for (const [ink, fill, min] of pairs) {
        const f = t.rgba(fill) as Rgba;
        const ratio = contrastRatio(t.rgba(ink) as Rgba, f[3] < 1 ? composite(f, bg) : f);
        if (!(ratio >= min))
          failures.push(
            `${type} ${JSON.stringify(themeVariables)}: ${ink} on ${fill}: ${ratio.toFixed(2)}`
          );
      }
    };
    for (const [type, pairs] of Object.entries(PAIRS)) check(type, pairs);
    for (const [type, { pairs, probes }] of Object.entries(PROBED))
      for (const probe of probes) check(type, pairs, probe);
    expect(failures).toEqual([]);
  });
});
