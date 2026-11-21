/**
 * The layout context the XY chart tests lay out with (the package specs, the conformance layout
 * corpus and parity): the `default` theme, the table measurer unless one is given, warnings
 * collected, and an `xyChart` config section.
 */
import type { Warning } from '@mermaid-js/core';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { namedTestTheme, sectionConfig } from '@mermaid-js/shared/testing/test-context';
import { XYCHART_SECTION } from './config.ts';
import type { XyChartLayoutContext } from './layout/index.ts';
import { theme as table } from './theme/table.ts';

/** The `default` theme resolved with the XY chart's theme table (D331). */
export const xyChartTestTheme = (): Promise<Theme> => namedTestTheme('default', table);

/** A layout context over `theme` with the `xyChart` section `section`; warnings go to `warnings`. */
export const xyChartTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  options: { measurer?: Measurer; warnings?: Warning[] } = {}
): XyChartLayoutContext => ({
  config: sectionConfig(XYCHART_SECTION, section),
  theme,
  measurer: options.measurer ?? tableMeasurer,
  warn: (w) => void options.warnings?.push(w),
});
