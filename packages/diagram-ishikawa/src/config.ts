/**
 * The `ishikawa` options the layout reads. The config resolver does not check value types (a
 * directive can set `"diagramPadding": "wide"`), and ishikawa has no warning code for config, so
 * a value the layout cannot use falls back to its default without a warning: a number, or a
 * numeric string as its number, at or above the schema's minimum.
 */

/** The `ishikawa` options the layout reads, every one set. */
export interface IshikawaLayoutConfig {
  /** Around the whole drawing (v12 `diagramPadding`). */
  readonly diagramPadding: number;
}

/**
 * The `IshikawaDiagramConfig` defaults (`packages/core/schema/config.schema.yaml`), which the
 * layout falls back to for a value it cannot use. The section is `pending` until T5, so core
 * resolves no defaults for it yet.
 */
const ISHIKAWA_CONFIG_DEFAULTS: IshikawaLayoutConfig = { diagramPadding: 20 };

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
