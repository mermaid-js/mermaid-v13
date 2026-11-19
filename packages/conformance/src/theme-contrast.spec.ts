/**
 * R-THEME-9 for the diagram tables (D29, spec #795): what a renderer draws on a diagram's own
 * fills reads in each classic theme. Core's `themes.spec.ts` checks the shared variables; a
 * diagram's variables resolve only with its table (D331), so its rows live here, each type's
 * resolved with its own table. Text needs WCAG AA (4.5:1); a mark that only has to be seen, a
 * border or a line, needs 3:1 (WCAG 1.4.11). A fill with alpha is judged composited over
 * `background`, as drawn. Rows are per diagram type and additive: a ticket adds its type's.
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
const MARK = 3;

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
  // #801 (#772): bar labels by state (`paint.ts` `labelColour`), the active bar's outline, and
  // the `vert` marker's label on the chart.
  gantt: [
    ['taskTextColor', 'taskBkgColor', TEXT],
    ['critTextColor', 'critBkgColor', TEXT],
    ['taskTextDarkColor', 'activeTaskBkgColor', TEXT],
    ['taskTextDarkColor', 'doneTaskBkgColor', TEXT],
    ['taskTextOutsideColor', 'background', TEXT],
    ['activeTaskBorderColor', 'activeTaskBkgColor', MARK],
    ['activeTaskBorderColor', 'background', MARK],
    ['vertLineColor', 'background', TEXT],
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
    // #758's own probe (#335577) is checked in `diagram-er` `table.spec.ts` and rendered in
    // `er-row-ink.spec.ts`.
    probes: [
      { primaryColor: '#000000' },
      { primaryColor: '#ffffff' },
      // A dark primaryColor under a pinned light entity fill: dark rows, light header.
      { primaryColor: '#000000', mainBkg: '#ececff' },
      { tertiaryColor: '#ff00ff' },
    ],
  },
  // Text on normal and critical bars (D574): a dark bar with light text, where an ink chosen
  // against red alone would land on the navy bar. The bars read `mainBkg` (D657), so the probe
  // darkens them through it.
  gantt: {
    pairs: PAIRS.gantt!.slice(0, 2),
    probes: [{ mainBkg: '#1a237e', textColor: '#ffffff' }],
  },
};

const specs = await Promise.all(CLASSIC.map((n) => loadTheme(n)));

describe('diagram inks on diagram fills in the classic themes (R-THEME-9, spec #795)', () => {
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
