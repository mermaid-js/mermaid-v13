/**
 * The `railroad` options the layout reads (spec #526 §Layout, D515), from the resolved `railroad`
 * config section as v12's `buildRailroadStyleOptions` (`styles.ts:189-254`) read them: a length
 * is a number, or a string read with `parseFloat` (`"12px"` is 12), finite and 0 or more, else
 * v12's default, with no warning (`sanitizeNumberValue`, `styles.ts:103-112`).
 *
 * `fontSize` and `fontFamily` have no default (D515): unset, the theme's `fontSize` and
 * `fontFamily` are used. A size must be above 0 (v12's `parseThemeFontSize`); a family must pass
 * core's style check. The colour keys have no default either: unset, the theme variable's colour
 * is drawn (D516). A colour or font that fails core's checks is dropped with one
 * `RAILROAD_CONFIG_INVALID` (the layout raises it). The section's keys are `honoured` (#615) and
 * its defaults generated (`gen:config`).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { checkColor, checkStyle, type SafeColor, type SafeValue } from '@mermaid-js/core/svg';
import { railroadConfigDefaults } from './generated/config-defaults.ts';

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
 * The lengths a value the layout cannot use falls back to: the section's generated defaults
 * (`packages/core/schema/config.schema.yaml`, `gen:config`), v12's `DEFAULT_RAILROAD_CONFIG`,
 * which the plugin also hands core as its `configDefaults`.
 */
export const RAILROAD_LAYOUT_DEFAULTS: RailroadLayoutConfig = Object.freeze({
  padding: railroadConfigDefaults.padding ?? 10,
  verticalSeparation: railroadConfigDefaults.verticalSeparation ?? 8,
  horizontalSeparation: railroadConfigDefaults.horizontalSeparation ?? 10,
  arcRadius: railroadConfigDefaults.arcRadius ?? 10,
  markerRadius: railroadConfigDefaults.markerRadius ?? 5,
  strokeWidth: railroadConfigDefaults.strokeWidth ?? 2,
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
  /** Checked by core's style check, as the renderer writes it. */
  readonly family?: SafeValue;
  readonly size?: number;
}

/** A `font-family` value that passes core's style check, as the writer takes it. */
export function checkFontFamily(value: unknown): SafeValue | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return checkStyle([`font-family:${value.trim()}`]).text['font-family'] as SafeValue | undefined;
}

/**
 * `fontFamily` and `fontSize` from the resolved `railroad` section, where usable: a family that
 * passes core's style check (the renderer writes it), a size of 0 or more (v12's
 * `sanitizeNumberValue` for the config's size; only the theme's size had to be above 0).
 */
export function railroadFontOverride(
  section: Readonly<Record<string, unknown>> | undefined
): RailroadFontOverride {
  const given = section ?? {};
  const family = checkFontFamily(given.fontFamily);
  const size = configNumber(given.fontSize);
  return {
    ...(family === undefined ? {} : { family }),
    ...(Number.isFinite(size) && size >= 0 ? { size } : {}),
  };
}

/**
 * The `railroad` colour keys the renderer draws and the theme variable each one beats (D515,
 * D516): v12's style keys, as `themeVariables.railroad.*` names them too. v12's three `comment*`
 * keys style nothing that is drawn.
 */
export const RAILROAD_COLOUR_KEYS = {
  terminalFill: 'railroadTerminalFill',
  terminalStroke: 'railroadTerminalStroke',
  terminalTextColor: 'railroadTerminalTextColor',
  nonTerminalFill: 'railroadNonTerminalFill',
  nonTerminalStroke: 'railroadNonTerminalStroke',
  nonTerminalTextColor: 'railroadNonTerminalTextColor',
  lineColor: 'railroadLineColor',
  markerFill: 'railroadMarkerFill',
  specialFill: 'railroadSpecialFill',
  specialStroke: 'railroadSpecialStroke',
  ruleNameColor: 'railroadRuleNameColor',
} as const;

export type RailroadColourKey = keyof typeof RAILROAD_COLOUR_KEYS;

/** A `railroad` colour or font the renderer cannot use (D515). */
export const RAILROAD_CONFIG_INVALID = 'RAILROAD_CONFIG_INVALID';

/** The `railroad` section, checked once (D515), for the layout and the renderer. */
export interface RailroadConfig {
  readonly lengths: RailroadLayoutConfig;
  /** The font it sets, key by key; what it leaves unset (or unusable) is the theme's. */
  readonly font: RailroadFontOverride;
  /** The colours it sets that pass core's colour check: each beats its theme variable. */
  readonly colours: Readonly<Partial<Record<RailroadColourKey, SafeColor>>>;
  readonly useMaxWidth: boolean;
  /** Each colour or font key it sets that is not usable, as `railroad.<key> <value>`. */
  readonly dropped: readonly string[];
}

const shown = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(v) : String(v));

/** The resolved `railroad` config section of a render. */
export function railroadSection(
  ctx: Pick<RenderContext, 'config'>
): Readonly<Record<string, unknown>> {
  return ((ctx.config as { railroad?: unknown }).railroad ?? {}) as Readonly<
    Record<string, unknown>
  >;
}

/** Checks the `railroad` section once: what the layout and the renderer read from it. */
export function railroadConfig(
  section: Readonly<Record<string, unknown>> | undefined
): RailroadConfig {
  const given = section ?? {};
  const dropped: string[] = [];
  const colours: Partial<Record<RailroadColourKey, SafeColor>> = {};
  for (const key of Object.keys(RAILROAD_COLOUR_KEYS) as RailroadColourKey[]) {
    const value = given[key];
    if (value === undefined) continue;
    const colour = typeof value === 'string' ? checkColor(value.trim()) : undefined;
    if (colour) colours[key] = colour;
    else dropped.push(`railroad.${key} ${shown(value)}`);
  }
  const font = railroadFontOverride(given);
  if (given.fontFamily !== undefined && font.family === undefined)
    dropped.push(`railroad.fontFamily ${shown(given.fontFamily)}`);
  if (given.fontSize !== undefined && font.size === undefined)
    dropped.push(`railroad.fontSize ${shown(given.fontSize)}`);
  return {
    lengths: railroadLayoutConfig(given),
    font,
    colours,
    useMaxWidth: given.useMaxWidth !== false,
    dropped,
  };
}

/**
 * One `RAILROAD_CONFIG_INVALID` naming every colour or font key of the section that is set but
 * unusable (D515), or none. Each such key is drawn with the theme's value, where v12 fell back
 * silently. A length that is not a number of 0 or more falls back silently, as in v12.
 */
export function railroadConfigWarning(config: RailroadConfig): Warning | undefined {
  if (config.dropped.length === 0) return undefined;
  return {
    code: RAILROAD_CONFIG_INVALID,
    message: `${config.dropped.join(', ')}: not usable; using the theme's value`,
    path: config.dropped[0]!.split(' ')[0]!,
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
