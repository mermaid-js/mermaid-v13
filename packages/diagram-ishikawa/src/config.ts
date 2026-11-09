/**
 * The `ishikawa` options the layout reads. The config resolver does not check value types (a
 * directive can set `"diagramPadding": "wide"`), and ishikawa has no warning code for config, so
 * a value the layout cannot use falls back to its default without a warning: a number, or a
 * numeric string as its number, at or above the schema's minimum.
 */
import { ishikawaConfigDefaults } from './generated/config-defaults.ts';

/** The `ishikawa` options the layout reads, every one set. */
export interface IshikawaLayoutConfig {
  /** Around the whole drawing (v12 `diagramPadding`). */
  readonly diagramPadding: number;
}

/**
 * The defaults the layout falls back to for a value it cannot use: the section's generated
 * defaults (`packages/core/schema/config.schema.yaml`, `gen:config`), which the plugin also hands
 * core as its `configDefaults`.
 */
const ISHIKAWA_CONFIG_DEFAULTS: IshikawaLayoutConfig = {
  diagramPadding: ishikawaConfigDefaults.diagramPadding ?? 20,
};

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

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
