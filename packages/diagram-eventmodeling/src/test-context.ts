/**
 * The render context the event modeling layout tests lay out with (the conformance layout specs
 * and the package's unit specs): a theme, the table measurer (or another), and an
 * `eventmodeling` config section. The theme has event modeling's own table (`theme/table.ts`,
 * #606); the layout reads only `fontFamily` and `fontSize`.
 */
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { Theme, ThemeName } from '@mermaid-js/core/theme';
import { namedTestTheme, sectionConfig } from '@mermaid-js/shared/testing/test-context';
import type { EventModelLayoutContext } from './layout/index.ts';
import { theme as table } from './theme/table.ts';

/** The theme `name` (`default`) with event modeling's table, and the author's `themeVariables`. */
export const eventModelTestTheme = (
  name: ThemeName = 'default',
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> => namedTestTheme(name, table, themeVariables);

/** A layout context over `theme` with the `eventmodeling` config section `section`. */
export const eventModelTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer,
  warn?: EventModelLayoutContext['warn']
): EventModelLayoutContext => ({
  config: sectionConfig('eventmodeling', section),
  theme,
  measurer,
  ...(warn ? { warn } : {}),
});
