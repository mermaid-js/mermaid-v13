/**
 * The render context the radar tests lay out and render with (the ported v12 specs, the
 * conformance layout corpus): the `default` theme with radar's own table, the table measurer,
 * warnings dropped, and a `radar` config section.
 */
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import type { RadarLayoutContext } from './layout/index.ts';
import { radar } from './plugin.ts';
import type { RadarRenderContext } from './render/index.ts';

export type RadarTestContext = RadarLayoutContext & RadarRenderContext;

/** The `default` theme resolved with radar's theme table (D331). */
export async function radarTestTheme(): Promise<Theme> {
  return createTheme(await loadTheme('default'), { diagram: radar.theme });
}

/** A layout and render context over `theme` with the `radar` config section `section`. */
export function radarTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  idPrefix = 'mermaid-0',
  version = '0.0.0'
): RadarTestContext {
  return {
    config: { radar: section } as unknown as ResolvedConfig,
    theme,
    measurer: tableMeasurer,
    warn: () => undefined,
    idPrefix,
    version,
  };
}
