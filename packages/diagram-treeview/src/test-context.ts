/**
 * The render context the treeView layout tests lay out with (the conformance layout specs and
 * the package's unit specs): a theme, the table measurer (or another), and a `treeView` config
 * section. TreeView's own theme table lands with the renderer (#575); until then the theme is
 * the named one alone.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme, type ThemeName } from '@mermaid-js/core/theme';
import type { TreeViewLayoutContext } from './layout/index.ts';

/** The theme `name` (`default`), with the author's `themeVariables`, if any. */
export async function treeViewTestTheme(
  name: ThemeName = 'default',
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name), themeVariables ? { themeVariables } : {});
}

/** A layout context over `theme` with the `treeView` config section `section`. */
export function treeViewTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer
): TreeViewLayoutContext {
  return { config: { treeView: section } as unknown as ResolvedConfig, theme, measurer };
}
