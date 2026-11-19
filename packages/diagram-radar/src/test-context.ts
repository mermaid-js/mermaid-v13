/**
 * The render context the radar tests lay out and render with (the ported v12 specs, the
 * conformance layout corpus): the `default` theme with radar's own table, the table measurer,
 * warnings dropped, and a `radar` config section.
 */
import { tableMeasurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { namedTestTheme, sectionConfig } from '@mermaid-js/shared/testing/test-context';
import type { RadarLayoutContext } from './layout/index.ts';
import { radar } from './plugin.ts';
import type { RadarRenderContext } from './render/index.ts';

export type RadarTestContext = RadarLayoutContext & RadarRenderContext;

/** The `default` theme resolved with radar's theme table (D331). */
export const radarTestTheme = (): Promise<Theme> => namedTestTheme('default', radar.theme);

/** A layout and render context over `theme` with the `radar` config section `section`. */
export const radarTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  idPrefix = 'mermaid-0',
  version = '0.0.0'
): RadarTestContext => ({
  config: sectionConfig('radar', section),
  theme,
  measurer: tableMeasurer,
  warn: () => undefined,
  idPrefix,
  version,
});
