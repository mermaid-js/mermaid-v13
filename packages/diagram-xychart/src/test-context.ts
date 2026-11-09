/**
 * The layout context the XY chart tests lay out with (the package specs, the conformance layout
 * corpus and parity): the `default` theme, the table measurer unless one is given, warnings
 * collected, and an `xyChart` config section.
 */
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { XYCHART_SECTION } from './config.ts';
import type { XyChartLayoutContext } from './layout/index.ts';
import { theme as table } from './theme/table.ts';

/** The `default` theme resolved with the XY chart's theme table (D331). */
export async function xyChartTestTheme(): Promise<Theme> {
  return createTheme(await loadTheme('default'), { diagram: table });
}

/** A layout context over `theme` with the `xyChart` section `section`; warnings go to `warnings`. */
export function xyChartTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  options: { measurer?: Measurer; warnings?: Warning[] } = {}
): XyChartLayoutContext {
  const warnings = options.warnings;
  return {
    config: { [XYCHART_SECTION]: section } as unknown as ResolvedConfig,
    theme,
    measurer: options.measurer ?? tableMeasurer,
    warn: (w) => warnings?.push(w),
  };
}
