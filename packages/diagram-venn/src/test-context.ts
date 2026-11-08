/**
 * The render context the venn tests lay out with (the layout specs, the conformance layout
 * corpus and parity): the `default` theme, the table measurer, warnings collected, and a `venn`
 * config section.
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { VennLayoutContext } from './layout/index.ts';

/** The `default` theme (venn's table is #495's). */
export async function vennTestTheme(): Promise<Theme> {
  return createTheme(await loadTheme('default'));
}

/** A layout context over `theme` with the `venn` config section `section`; warnings go to `warnings`. */
export function vennTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  warnings: Warning[] = [],
  measurer: Measurer = tableMeasurer
): VennLayoutContext {
  return {
    config: { venn: section } as unknown as ResolvedConfig,
    theme,
    measurer,
    warn: (w) => warnings.push(w),
  };
}
