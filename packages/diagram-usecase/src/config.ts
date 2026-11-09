/**
 * The `usecase` options the layout and the renderer read, from the resolved config's `usecase`
 * section, resolved once per render (`UsecasePrepared.config`). The
 * defaults are v12's schema defaults (`UsecaseDiagramConfig` in `config.schema.yaml` at
 * fa796a943, the same in `packages/core/schema/config.schema.yaml`). The plugin's
 * `configDefaults` (`generated/config-defaults.ts`, #567) fill the section with them; this file
 * keeps them as the value a key the layout cannot use falls back to (`config-defaults.spec.ts`
 * holds the two equal).
 *
 * The config resolver checks no value types, so a directive can set any of these to anything. A
 * length is a number, or a numeric string as its number, from the schema's minimum up to 10000;
 * a family is one the style check allows; a weight is one of the schema's. Anything else that is
 * set draws with the default and raises one `USECASE_CONFIG_IGNORED` per key (pitfall 22).
 *
 * The two font families inherit the theme's `fontFamily` (D132: fonts are uniform across
 * diagrams) unless the author sets one: v12's default `"Open Sans", sans-serif` is not applied.
 * The resolved config cannot tell a default from an author's value, so the schema gives both
 * family keys no default (as sequence's `actorFontFamily`) and the section defaults leave them out.
 */
import { checkStyle } from '@mermaid-js/core/svg';
import { USECASE_CONFIG_IGNORED } from './codes.ts';

/** The CSS weights a font key takes, as numbers. */
export const FONT_WEIGHT = Object.freeze({ normal: 400, bold: 700 });

/** One font as the config gives it; `family` unset means the theme's. */
export interface ConfigFont {
  readonly family?: string;
  readonly size: number;
  readonly weight: number;
}

/** The `usecase` options the layout reads, every one set (but the families). */
export interface UsecaseLayoutConfig {
  readonly wrappingWidth: number;
  readonly minNodeWidth: number;
  readonly nodeSpacing: number;
  readonly rankSpacing: number;
  readonly diagramPadding: number;
  /** Actor labels and stereotypes. */
  readonly actorFont: ConfigFont;
  /** Use case labels and stereotypes. */
  readonly usecaseFont: ConfigFont;
  /** `rotate`: actors and use cases take their palette slot's colours (the renderer's). */
  readonly colorScheme: 'role' | 'rotate';
  /** The root's width is `100%` with a `max-width` (the renderer's). */
  readonly useMaxWidth: boolean;
}

/** v12's schema defaults for the keys the layout reads. */
export const USECASE_CONFIG_DEFAULTS = Object.freeze({
  wrappingWidth: 120,
  minNodeWidth: 120,
  actorFontSize: 14,
  actorFontWeight: 'normal',
  usecaseFontSize: 12,
  usecaseFontWeight: 'normal',
  nodeSpacing: 50,
  rankSpacing: 50,
  diagramPadding: 20,
  colorScheme: 'role',
  useMaxWidth: true,
});

type LengthKey =
  | 'wrappingWidth'
  | 'minNodeWidth'
  | 'nodeSpacing'
  | 'rankSpacing'
  | 'diagramPadding'
  | 'actorFontSize'
  | 'usecaseFontSize';

/** The schema's `minimum` per length; the font sizes start at 1. */
const MINIMUM: Readonly<Record<LengthKey, number>> = {
  wrappingWidth: 0,
  minNodeWidth: 0,
  nodeSpacing: 0,
  rankSpacing: 0,
  diagramPadding: 0,
  actorFontSize: 1,
  usecaseFontSize: 1,
};

/** Lengths at or above this are not taken (the cap every graph port has); styled font sizes too. */
export const MAX_LENGTH = 1e4;

/** A whole decimal number, spaces around it allowed: `"20"`, `" 2.5 "`; not `"20px"`. */
const NUMERIC = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

/** The schema's weight pattern (`cssFontWeightPattern`). */
const WEIGHT = /^(normal|bold|bolder|lighter|inherit|initial|revert|unset|[1-9][0-9]{0,3})$/;

/** A config warning (pitfall 22). */
export interface ConfigWarning {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

/**
 * A CSS `font-weight` (the config's or a style's) as the number a label is measured with:
 * `bold`/`bolder` 700, `normal`/`lighter` 400 (the measurer only tells bold from not), a whole
 * number as itself; undefined for anything else (`inherit`, …), which keeps the font's own.
 */
export function fontWeight(value: unknown): number | undefined {
  if (value === 'bold' || value === 'bolder') return FONT_WEIGHT.bold;
  if (value === 'normal' || value === 'lighter') return FONT_WEIGHT.normal;
  const n = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** v12's `colorScheme`: `role` or `rotate`; anything else is `role`, with a warning. */
function colorScheme(
  value: unknown,
  ignored: (key: string, using: string) => void
): UsecaseLayoutConfig['colorScheme'] {
  if (value === undefined || value === 'role' || value === 'rotate') return value ?? 'role';
  ignored('colorScheme', 'role');
  return 'role';
}

/** The layout's options from the resolved `usecase` section, warning once per key not taken. */
export function usecaseLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn?: (warning: ConfigWarning) => void
): UsecaseLayoutConfig {
  const given = section ?? {};
  const ignored = (key: string, using: string): void =>
    warn?.({
      code: USECASE_CONFIG_IGNORED,
      message: `Ignored usecase.${key}: it is not a value the usecase layout can use; using ${using}`,
      path: `usecase.${key}`,
    });
  const length = (key: LengthKey): number => {
    const value = given[key];
    const fallback = USECASE_CONFIG_DEFAULTS[key];
    if (value === undefined) return fallback;
    const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n >= MINIMUM[key] && n < MAX_LENGTH)
      return n;
    ignored(key, String(fallback));
    return fallback;
  };
  const font = (prefix: 'actor' | 'usecase'): ConfigFont => {
    const familyKey = `${prefix}FontFamily`;
    const weightKey = `${prefix}FontWeight` as const;
    const f = given[familyKey];
    let family: string | undefined;
    if (f !== undefined) {
      const safe =
        typeof f === 'string' && f.trim() !== ''
          ? checkStyle([`font-family:${f}`]).text['font-family']
          : undefined;
      if (typeof safe === 'string') family = safe;
      else ignored(familyKey, "the theme's fontFamily");
    }
    const w = given[weightKey];
    let weight = fontWeight(USECASE_CONFIG_DEFAULTS[weightKey]) ?? FONT_WEIGHT.normal;
    if (w !== undefined) {
      const text = typeof w === 'number' ? String(w) : w;
      if (typeof text === 'string' && WEIGHT.test(text)) weight = fontWeight(text) ?? weight;
      else ignored(weightKey, USECASE_CONFIG_DEFAULTS[weightKey]);
    }
    return {
      ...(family !== undefined ? { family } : {}),
      size: length(`${prefix}FontSize`),
      weight,
    };
  };
  return {
    wrappingWidth: length('wrappingWidth'),
    minNodeWidth: length('minNodeWidth'),
    nodeSpacing: length('nodeSpacing'),
    rankSpacing: length('rankSpacing'),
    diagramPadding: length('diagramPadding'),
    actorFont: font('actor'),
    usecaseFont: font('usecase'),
    colorScheme: colorScheme(given.colorScheme, ignored),
    useMaxWidth: given.useMaxWidth !== false,
  };
}
