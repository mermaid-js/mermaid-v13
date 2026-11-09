/**
 * The render context the event modeling layout tests lay out with (the conformance layout specs
 * and the package's unit specs): a theme, the table measurer (or another), and an
 * `eventmodeling` config section. The theme has no event modeling table yet (#606); the layout
 * reads only `fontFamily` and `fontSize`.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme, type ThemeName } from '@mermaid-js/core/theme';
import type { EventModelLayoutContext } from './layout/index.ts';

/** The theme `name` (`default`). */
export async function eventModelTestTheme(name: ThemeName = 'default'): Promise<Theme> {
  return createTheme(await loadTheme(name));
}

/** A layout context over `theme` with the `eventmodeling` config section `section`. */
export function eventModelTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer,
  warn?: EventModelLayoutContext['warn']
): EventModelLayoutContext {
  return {
    config: { eventmodeling: section } as unknown as ResolvedConfig,
    theme,
    measurer,
    ...(warn ? { warn } : {}),
  };
}
