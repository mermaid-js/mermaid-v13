/**
 * The render context the sankey tests lay out with (the package specs, the conformance layout
 * corpus): the `default` theme (sankey adds no theme variables), the table measurer (or one a
 * spec gives), and a `sankey` config section.
 */
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { namedTestTheme, sectionConfig } from '@mermaid-js/shared/testing/test-context';
import type { SankeyLayoutContext } from './layout/index.ts';

/** The `default` theme. */
export const sankeyTestTheme = (): Promise<Theme> => namedTestTheme('default');

/** A layout context over `theme` with the `sankey` config section `section`. */
export const sankeyTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer
): SankeyLayoutContext => ({ config: sectionConfig('sankey', section), theme, measurer });
