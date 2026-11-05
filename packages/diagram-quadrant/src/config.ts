/**
 * The `quadrantChart` options the layout reads, checked (D226: never NaN, warn once). The config
 * resolver does not check value types, so a directive can set `"pointRadius": "big"`. A length
 * is read as `configNumber()` in sequence and ER reads it: a number, or a numeric string as its
 * number (v12 drew `"7"` as 7). Anything else, and a side that is not one of the key's two, falls
 * back to the schema default with one `QUADRANT_CONFIG_INVALID` warning per key.
 */
import type { Warning } from '@mermaid-js/core';
import { quadrantChartConfigDefaults } from './generated/config-defaults.ts';
import type { QuadrantLayoutConfig } from './layout/index.ts';

type NumberKey = {
  [K in keyof QuadrantLayoutConfig]: QuadrantLayoutConfig[K] extends number ? K : never;
}[keyof QuadrantLayoutConfig];

const NUMBERS: readonly NumberKey[] = [
  'chartWidth',
  'chartHeight',
  'titleFontSize',
  'titlePadding',
  'quadrantPadding',
  'xAxisLabelPadding',
  'yAxisLabelPadding',
  'xAxisLabelFontSize',
  'yAxisLabelFontSize',
  'quadrantLabelFontSize',
  'quadrantTextTopPadding',
  'pointTextPadding',
  'pointLabelFontSize',
  'pointRadius',
  'quadrantInternalBorderStrokeWidth',
  'quadrantExternalBorderStrokeWidth',
];

/** The sides each axis can take (the schema's enums). */
const SIDES: Readonly<Record<'xAxisPosition' | 'yAxisPosition', readonly string[]>> = {
  xAxisPosition: ['top', 'bottom'],
  yAxisPosition: ['left', 'right'],
};

const DEFAULTS = quadrantChartConfigDefaults as QuadrantLayoutConfig;

/** A length in px: a finite number ≥ 0, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

const invalid = (key: string, value: unknown, wants: string, used: unknown): Warning => ({
  code: 'QUADRANT_CONFIG_INVALID',
  message: `quadrantChart.${key} is ${shown(value)}, not ${wants}; using the default ${shown(used)}`,
});

/** The layout's options from the resolved `quadrantChart` section, each checked. */
export function quadrantLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn: (w: Warning) => void
): QuadrantLayoutConfig {
  const out: Record<string, unknown> = { ...DEFAULTS };
  const given = section ?? {};
  const set = (key: string): boolean => Object.hasOwn(given, key) && given[key] !== undefined;
  for (const key of NUMBERS) {
    if (!set(key)) continue;
    const n = configNumber(given[key]);
    if (n === undefined) warn(invalid(key, given[key], 'a number of 0 or more', DEFAULTS[key]));
    else out[key] = n;
  }
  for (const [key, sides] of Object.entries(SIDES)) {
    if (!set(key)) continue;
    const v = given[key];
    if (typeof v === 'string' && sides.includes(v)) out[key] = v;
    else warn(invalid(key, v, sides.map((s) => `"${s}"`).join(' or '), out[key]));
  }
  return out as QuadrantLayoutConfig;
}
