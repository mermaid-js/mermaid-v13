/**
 * The `venn` options the layout reads, checked (D417: never NaN, one warning per kind). The
 * config resolver does not check value types, so a directive can set `"width": "wide"`. A
 * length is a number, or a numeric string as its number, inside the schema's range; a flag is
 * a boolean. Anything else falls back to the default, and one `VENN_CONFIG_INVALID` warning
 * names every such key.
 */
import type { Warning } from '@mermaid-js/core';
import { VENN_CONFIG_INVALID } from './codes.ts';
import { VENN_CONFIG_DEFAULTS, VENN_METRICS } from './layout/metrics.ts';

/** The `venn` options the layout reads, every one set. */
export interface VennLayoutConfig {
  readonly width: number;
  readonly height: number;
  /** `venn.padding` when given, else venn.js's 15 (D412). */
  readonly padding: number;
  readonly useDebugLayout: boolean;
}

/** A length key's schema range and how the warning names it. */
interface Range {
  readonly min: number;
  readonly wants: string;
}

const LENGTHS: Readonly<Record<'width' | 'height' | 'padding', Range>> = {
  width: { min: 1, wants: 'a number of 1 or more' },
  height: { min: 1, wants: 'a number of 1 or more' },
  padding: { min: 0, wants: 'a number of 0 or more' },
};

const DEFAULTS: VennLayoutConfig = { ...VENN_CONFIG_DEFAULTS, padding: VENN_METRICS.padding };

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** The layout's options from the resolved `venn` section, each checked. */
export function vennLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn: (w: Warning) => void
): VennLayoutConfig {
  const out = { ...DEFAULTS } as { -readonly [K in keyof VennLayoutConfig]: VennLayoutConfig[K] };
  const given = section ?? {};
  const bad: string[] = [];
  const has = (key: string): boolean => Object.hasOwn(given, key) && given[key] !== undefined;
  for (const key of Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]) {
    if (!has(key)) continue;
    const { min, wants } = LENGTHS[key];
    const n = configNumber(given[key]);
    if (n !== undefined && n >= min) out[key] = n;
    else bad.push(`venn.${key} is ${shown(given[key])}, not ${wants}; using ${DEFAULTS[key]}`);
  }
  if (has('useDebugLayout')) {
    const v = given.useDebugLayout;
    if (typeof v === 'boolean') out.useDebugLayout = v;
    else bad.push(`venn.useDebugLayout is ${shown(v)}, not true or false; using false`);
  }
  if (bad.length > 0) warn({ code: VENN_CONFIG_INVALID, message: `${bad.join('. ')}.` });
  return out;
}
