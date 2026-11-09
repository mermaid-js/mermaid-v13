/**
 * `showValues` and `valueFormat` as the layout and the renderer read them (D409), in one place
 * for the layout's config (`config.ts`) and for hover (`facet/values.ts`), which reads the same
 * keys from the text alone and must not load `config.ts` or the layout (D89). The defaults are
 * the schema's (`pnpm gen:config`). `showValues` is on unless `false`; a `valueFormat` string is
 * used as written, an empty one is the default `,`, and one that is not a string is the default
 * too, which `invalid` (the layout's `TREEMAP_CONFIG_INVALID` warning) is told of.
 */
import type { TreemapDiagramConfig } from '@mermaid-js/core/config';
import { treemapConfigDefaults } from './generated/config-defaults.ts';

/** The two value keys, both set. */
export type TreemapValueOptions = Readonly<
  Required<Pick<TreemapDiagramConfig, 'showValues' | 'valueFormat'>>
>;

/** The schema's defaults, every key set (`conformance/src/treemap/config.spec.ts` pins them). */
export const TREEMAP_DEFAULTS = treemapConfigDefaults as Readonly<Required<TreemapDiagramConfig>>;

/** `showValues` and `valueFormat` from a merged `treemap` section. */
export function treemapValueOptions(
  given: Readonly<Record<string, unknown>>,
  invalid?: (key: 'valueFormat', wants: string, used: string) => void
): TreemapValueOptions {
  const d = TREEMAP_DEFAULTS;
  const format = given.valueFormat;
  let valueFormat = d.valueFormat;
  if (typeof format === 'string') valueFormat = format === '' ? d.valueFormat : format;
  else if (format !== undefined) invalid?.('valueFormat', 'a d3-format specifier', d.valueFormat);
  const showValues = given.showValues === undefined ? d.showValues : given.showValues !== false;
  return { showValues, valueFormat };
}
