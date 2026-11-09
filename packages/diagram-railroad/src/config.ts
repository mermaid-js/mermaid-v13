/**
 * The `railroad` options the layout reads (spec #526 §Layout, D515), from the resolved `railroad`
 * config section as v12's `buildRailroadStyleOptions` (`styles.ts:189-254`) read them: a length
 * is a number, or a string read with `parseFloat` (`"12px"` is 12), finite and 0 or more, else
 * v12's default, with no warning (`sanitizeNumberValue`, `styles.ts:103-112`).
 *
 * `fontSize` and `fontFamily` have no default (D515): unset, the theme's `fontSize` and
 * `fontFamily` are used. A size must be above 0 (v12's `parseThemeFontSize`); a family must be a
 * non-empty string. T5 (#615) moves the keys to `honoured`, generates the section defaults and
 * adds the `RAILROAD_CONFIG_INVALID` warning for a font or colour that fails core's checks.
 */
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

/** The `railroad` lengths the layout reads, every one set. */
export interface RailroadLayoutConfig {
  /** Around the text of a terminal, nonterminal or special, and the diagram's margin. */
  readonly padding: number;
  /** Between the branches of a choice and between rules. */
  readonly verticalSeparation: number;
  /** Between the elements of a sequence. */
  readonly horizontalSeparation: number;
  /** The radius of every track corner. */
  readonly arcRadius: number;
  /** The start and end markers' radius. */
  readonly markerRadius: number;
  /** The track's and the boxes' stroke width (the bounds include half of it). */
  readonly strokeWidth: number;
}

/**
 * v12's defaults (`railroadTypes.ts` `DEFAULT_RAILROAD_CONFIG`, equal to the schema's
 * `RailroadDiagramConfig` defaults in `packages/core/schema/config.schema.yaml`).
 */
export const RAILROAD_LAYOUT_DEFAULTS: RailroadLayoutConfig = Object.freeze({
  padding: 10,
  verticalSeparation: 8,
  horizontalSeparation: 10,
  arcRadius: 10,
  markerRadius: 5,
  strokeWidth: 2,
});

const KEYS = Object.keys(RAILROAD_LAYOUT_DEFAULTS) as (keyof RailroadLayoutConfig)[];

/** v12's number reading: a number as it is, a string through `parseFloat`; else NaN. */
function configNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return Number.NaN;
}

/** The layout's lengths from the resolved `railroad` section. */
export function railroadLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined
): RailroadLayoutConfig {
  const given = section ?? {};
  const out: Record<string, number> = {};
  for (const key of KEYS) {
    const n = configNumber(given[key]);
    out[key] = Number.isFinite(n) && n >= 0 ? n : RAILROAD_LAYOUT_DEFAULTS[key];
  }
  return Object.freeze(out) as unknown as RailroadLayoutConfig;
}

/** The font the `railroad` section sets, key by key; what it leaves unset is the theme's. */
export interface RailroadFontOverride {
  readonly family?: string;
  readonly size?: number;
}

/** `fontFamily` and `fontSize` from the resolved `railroad` section, where usable. */
export function railroadFontOverride(
  section: Readonly<Record<string, unknown>> | undefined
): RailroadFontOverride {
  const given = section ?? {};
  const family = typeof given.fontFamily === 'string' ? given.fontFamily.trim() : '';
  const size = configNumber(given.fontSize);
  return {
    ...(family === '' ? {} : { family }),
    ...(Number.isFinite(size) && size > 0 ? { size } : {}),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The `railroad` config a source sets itself: its front matter's `config.railroad`, then each
 * `%%{init}%%`'s `railroad`, merged key by key, as the resolved config takes them. For callers
 * that lay out without a resolved config (the layout specs and the conformance layout corpus).
 */
export function railroadSectionOf(pre: PreprocessResult): Record<string, unknown> {
  const parts: unknown[] = [pre.frontMatter?.config?.railroad];
  for (const dir of pre.directives) {
    if (dir.kind === 'init' && isRecord(dir.args)) parts.push(dir.args.railroad);
  }
  return Object.assign({}, ...parts.filter(isRecord)) as Record<string, unknown>;
}
