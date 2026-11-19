/**
 * The render context the treeView layout tests lay out with (the conformance layout specs and
 * the package's unit specs): a theme with treeView's own table (`theme/table.ts`, #575), the
 * table measurer (or another), and a `treeView` config section.
 */
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { Theme, ThemeName } from '@mermaid-js/core/theme';
import { namedTestTheme, sectionConfig } from '@mermaid-js/shared/testing/test-context';
import type { TreeViewLayoutContext } from './layout/index.ts';
import { theme as table } from './theme/table.ts';

/** `name` (`default`) with treeView's table, and the author's `themeVariables`, if any. */
export const treeViewTestTheme = (
  name: ThemeName = 'default',
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> => namedTestTheme(name, table, themeVariables);

/** A layout context over `theme` with the `treeView` config section `section`. */
export const treeViewTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer
): TreeViewLayoutContext => ({ config: sectionConfig('treeView', section), theme, measurer });
