/**
 * The render context the treemap tests lay out with (the conformance layout specs and the
 * package's unit specs): a theme with treemap's own table (`theme/table.ts`), the table measurer
 * (or another), and a `treemap` config section.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme, type ThemeName } from '@mermaid-js/core/theme';
import type { TreemapLayoutContext } from './layout/index.ts';
import { theme as table } from './theme/table.ts';

/** `name` (`default`) with treemap's table, and the author's `themeVariables`, if any. */
export async function treemapTestTheme(
  name: ThemeName = 'default',
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name), {
    diagram: table,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

/** A layout context over `theme` with the `treemap` config section `section`. */
export function treemapTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer
): TreemapLayoutContext {
  return { config: { treemap: section } as unknown as ResolvedConfig, theme, measurer };
}
