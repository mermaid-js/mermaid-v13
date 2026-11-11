/**
 * The `ishikawa` options the layout and the renderer read. The config resolver does not check
 * value types (a directive can set `"diagramPadding": "wide"`), and ishikawa has no warning code
 * for config, so a value that cannot be used falls back to its default without a warning: for
 * `diagramPadding` a number, or a numeric string as its number, at or above the schema's
 * minimum; for `useMaxWidth` a boolean.
 */
import { configNumber, type IshikawaDiagramConfig, useMaxWidth } from '@mermaid-js/core/config';
import { ishikawaConfigDefaults } from './generated/config-defaults.ts';

/** The `ishikawa` options the layout reads, every one set. */
export interface IshikawaLayoutConfig {
  /** Around the whole drawing (v12 `diagramPadding`). */
  readonly diagramPadding: number;
}

/**
 * The defaults for a value that cannot be used: the section's generated defaults
 * (`packages/core/schema/config.schema.yaml`, `gen:config`), the one source, which the plugin
 * also hands core as its `configDefaults`. The schema gives both keys a default (`config.spec.ts`
 * checks they are set), so the generated object has them although its type leaves them optional.
 */
export const ISHIKAWA_CONFIG_DEFAULTS = ishikawaConfigDefaults as Required<
  Pick<IshikawaDiagramConfig, 'diagramPadding' | 'useMaxWidth'>
>;

/** The layout's options from the resolved `ishikawa` section. */
export function ishikawaLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined
): IshikawaLayoutConfig {
  const padding = configNumber(section?.diagramPadding);
  return {
    diagramPadding:
      padding !== undefined && padding >= 0 ? padding : ISHIKAWA_CONFIG_DEFAULTS.diagramPadding,
  };
}

/** Whether the root draws at 100 % width with a `max-width` (`ishikawa.useMaxWidth`). */
export function ishikawaUseMaxWidth(
  section: Readonly<Record<string, unknown>> | undefined
): boolean {
  return useMaxWidth(section?.useMaxWidth, 'boolean', ISHIKAWA_CONFIG_DEFAULTS.useMaxWidth);
}
