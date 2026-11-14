/**
 * R-THEME-9 for the diagram tables (D29, spec #795): what a renderer draws on a diagram's own
 * fills reads in each classic theme. Core's `themes.spec.ts` checks the shared variables; a
 * diagram's variables resolve only with its table (D331), so its rows live here, resolved through
 * `everyTable`. Text needs WCAG AA (4.5:1); a mark that only has to be seen, a border or a line,
 * needs 3:1 (WCAG 1.4.11). Rows are per diagram type and additive: a ticket adds its type's.
 */
import { composite, contrastRatio, loadTheme, type Rgba } from '@mermaid-js/core/theme';
import { describe, expect, it } from 'vitest';
import { everyTable } from './diagram-themes.ts';

const CLASSIC = ['default', 'dark', 'forest', 'neutral', 'base'] as const;

const TEXT = 4.5;
const MARK = 3;

/** An ink drawn on a fill, and the ratio it needs. */
type Pair = readonly [ink: string, fill: string, min: number];

const PAIRS: Readonly<Record<string, readonly Pair[]>> = {
  // #801 (#772): bar labels by state (`paint.ts` `labelColour`), the active bar's outline, and
  // the `vert` marker's label on the chart.
  gantt: [
    ['taskTextColor', 'taskBkgColor', TEXT],
    ['taskTextColor', 'critBkgColor', TEXT],
    ['taskTextDarkColor', 'activeTaskBkgColor', TEXT],
    ['taskTextDarkColor', 'doneTaskBkgColor', TEXT],
    ['taskTextOutsideColor', 'background', TEXT],
    ['activeTaskBorderColor', 'activeTaskBkgColor', MARK],
    ['activeTaskBorderColor', 'background', MARK],
    ['vertLineColor', 'background', TEXT],
  ],
};

const specs = await Promise.all(CLASSIC.map((n) => loadTheme(n)));

describe('diagram inks on diagram fills in the classic themes (R-THEME-9, spec #795)', () => {
  it.each(specs.map((s) => [s.name, s] as const))('%s', (_name, spec) => {
    const t = everyTable(spec, { cssVariables: false });
    const bg = t.rgba('background') as Rgba;
    const failures: string[] = [];
    for (const [type, pairs] of Object.entries(PAIRS))
      for (const [ink, fill, min] of pairs) {
        const f = t.rgba(fill) as Rgba;
        const ratio = contrastRatio(t.rgba(ink) as Rgba, f[3] < 1 ? composite(f, bg) : f);
        if (!(ratio >= min)) failures.push(`${type}: ${ink} on ${fill}: ${ratio.toFixed(2)}`);
      }
    expect(failures).toEqual([]);
  });
});
