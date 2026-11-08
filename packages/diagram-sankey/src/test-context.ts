/**
 * The render context the sankey tests lay out with (the package specs, the conformance layout
 * corpus): the `default` theme (sankey adds no theme variables), the table measurer, and a
 * `sankey` config section.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { SankeyLayoutContext } from './layout/index.ts';

/** The `default` theme. */
export async function sankeyTestTheme(): Promise<Theme> {
  return createTheme(await loadTheme('default'));
}

/** A layout context over `theme` with the `sankey` config section `section`. */
export function sankeyTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {}
): SankeyLayoutContext {
  return {
    config: { sankey: section } as unknown as ResolvedConfig,
    theme,
    measurer: tableMeasurer,
  };
}
