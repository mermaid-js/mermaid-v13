/**
 * The `treemap` options the layout reads (spec #428 T5 adds the `treemap` schema section and its
 * generated defaults; until then the defaults here are v12's `defaultConfig.ts:326-337`). A key
 * is read as v12 read it where that gives a usable value: `nodeWidth`/`nodeHeight` of 0 is v12's
 * fallback canvas, `showValues` is on unless `false`, an empty or non-string `valueFormat` is
 * `,`. A value that is not a number in range falls back to the default (T5 decides on a warning).
 */

export interface TreemapLayoutConfig {
  /** The canvas is `nodeWidth × 10` wide, or v12's 960 when 0. */
  readonly nodeWidth: number;
  readonly nodeHeight: number;
  /** d3's `paddingInner`. */
  readonly padding: number;
  /** Around the bounding box (D224). */
  readonly diagramPadding: number;
  readonly showValues: boolean;
  readonly valueFormat: string;
}

/** v12's defaults (`defaultConfig.ts:326-337`). */
export const TREEMAP_DEFAULTS: TreemapLayoutConfig = {
  nodeWidth: 100,
  nodeHeight: 40,
  padding: 10,
  diagramPadding: 8,
  showValues: true,
  valueFormat: ',',
};

/** A finite number of 0 or more, or a string that reads as one; else undefined. */
function length(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** The layout's options from the resolved `treemap` section. */
export function treemapLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined
): TreemapLayoutConfig {
  const given = section ?? {};
  const d = TREEMAP_DEFAULTS;
  return {
    nodeWidth: length(given.nodeWidth) ?? d.nodeWidth,
    nodeHeight: length(given.nodeHeight) ?? d.nodeHeight,
    padding: length(given.padding) ?? d.padding,
    diagramPadding: length(given.diagramPadding) ?? d.diagramPadding,
    showValues: given.showValues !== false,
    valueFormat:
      typeof given.valueFormat === 'string' && given.valueFormat !== ''
        ? given.valueFormat
        : d.valueFormat,
  };
}
