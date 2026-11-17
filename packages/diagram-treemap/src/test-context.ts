/**
 * The render context the treemap tests lay out with (the conformance layout specs and the
 * package's unit specs): a theme with treemap's own table (`theme/table.ts`), the table measurer
 * (or another), and a `treemap` config section.
 */
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { Theme, ThemeName } from '@mermaid-js/core/theme';
import { namedTestTheme, sectionConfig } from '@mermaid-js/shared/testing/test-context';
import type { TreemapLayoutContext } from './layout/index.ts';
import { theme as table } from './theme/table.ts';

/** `name` (`default`) with treemap's table, and the author's `themeVariables`, if any. */
export const treemapTestTheme = (
  name: ThemeName = 'default',
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> => namedTestTheme(name, table, themeVariables);

/** A layout context over `theme` with the `treemap` config section `section`. */
export const treemapTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer
): TreemapLayoutContext => ({ config: sectionConfig('treemap', section), theme, measurer });
