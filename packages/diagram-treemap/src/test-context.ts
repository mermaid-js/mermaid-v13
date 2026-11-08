/**
 * The render context the treemap tests lay out with (the conformance layout specs and the
 * package's unit specs): the `default` theme, the table measurer (or another), and a `treemap`
 * config section. Treemap's own theme
 * table arrives with its renderer (#505); the layout reads only core's `fontFamily`.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { TreemapLayoutContext } from './layout/index.ts';

/** The `default` theme. */
export async function treemapTestTheme(): Promise<Theme> {
  return createTheme(await loadTheme('default'));
}

/** A layout context over `theme` with the `treemap` config section `section`. */
export function treemapTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer
): TreemapLayoutContext {
  return { config: { treemap: section } as unknown as ResolvedConfig, theme, measurer };
}
