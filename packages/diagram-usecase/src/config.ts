/**
 * The `usecase` options the layout and the renderer read, from the resolved config's `usecase`
 * section, resolved once per render (`UsecasePrepared.config`). The fallbacks are the plugin's
 * `configDefaults` (`generated/config-defaults.ts`, v12's schema defaults at fa796a943, #567),
 * which fill the section in a render; a key the layout cannot use falls back to them too.
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
import { usecaseConfigDefaults } from './generated/config-defaults.ts';
import { NUMERIC } from '@mermaid-js/core/config';

/** The CSS weights a font key takes, as numbers. */
export const FONT_WEIGHT = Object.freeze({ normal: 400, bold: 700 });

/** One font as the config gives it; `family` unset means the theme's. */
export interface ConfigFont {
  readonly family?: string;
  readonly size: number;
  readonly weight: number;
}

/** The `usecase` keys the layout reads. */
export type UsecaseConfigKey =
  | LengthKey
  | 'actorFontFamily'
  | 'actorFontWeight'
  | 'usecaseFontFamily'
  | 'usecaseFontWeight'
  | 'colorScheme'
  | 'useMaxWidth';

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
  /**
   * The keys set by the author: taken, and off their default (a family whenever taken). The
   * resolved section carries the defaults, so a value equal to its default counts as not set
   * (as ER's sizes, D124); a value not taken is not set either: the default is drawn.
   */
  readonly set: ReadonlySet<UsecaseConfigKey>;
}

/** The section defaults of the keys the layout reads (`configDefaults`, every one given). */
const DEFAULTS = usecaseConfigDefaults as Required<
  Pick<typeof usecaseConfigDefaults, Exclude<UsecaseConfigKey, `${string}FontFamily`>>
>;

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

/** The layout's options from the resolved `usecase` section, warning once per key not taken. */
export function usecaseLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn?: (warning: ConfigWarning) => void
): UsecaseLayoutConfig {
  const given = section ?? {};
  const set = new Set<UsecaseConfigKey>();
  const ignored = (key: UsecaseConfigKey, using: string): void =>
    warn?.({
      code: USECASE_CONFIG_IGNORED,
      message: `Ignored usecase.${key}: it is not a value the usecase layout can use; using ${using}`,
      path: `usecase.${key}`,
    });
  /** The value `read` takes from the key, else the default (with a warning if one was given). */
  const take = <T>(
    key: UsecaseConfigKey,
    fallback: T,
    using: string,
    read: (v: unknown) => T | undefined
  ): T => {
    const value = given[key];
    if (value === undefined) return fallback;
    const taken = read(value);
    if (taken === undefined) {
      ignored(key, using);
      return fallback;
    }
    if (taken !== fallback) set.add(key);
    return taken;
  };
  const length = (key: LengthKey): number =>
    take(key, DEFAULTS[key], String(DEFAULTS[key]), (value) => {
      const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
      return typeof n === 'number' && Number.isFinite(n) && n >= MINIMUM[key] && n < MAX_LENGTH
        ? n
        : undefined;
    });
  const font = (prefix: 'actor' | 'usecase'): ConfigFont => {
    const family = take<string | undefined>(
      `${prefix}FontFamily`,
      undefined,
      "the theme's fontFamily",
      (f) => {
        if (typeof f !== 'string' || f.trim() === '') return undefined;
        const safe = checkStyle([`font-family:${f}`]).text['font-family'];
        return typeof safe === 'string' ? safe : undefined;
      }
    );
    const weightKey = `${prefix}FontWeight` as const;
    const normal = fontWeight(DEFAULTS[weightKey]) ?? FONT_WEIGHT.normal;
    // A schema weight with no number (`inherit`, …) keeps the default, unwarned.
    const weight = take(weightKey, normal, DEFAULTS[weightKey], (w) => {
      const text = typeof w === 'number' ? String(w) : w;
      return typeof text === 'string' && WEIGHT.test(text)
        ? (fontWeight(text) ?? normal)
        : undefined;
    });
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
    // v12's `colorScheme`: `role` or `rotate`; anything else is `role`, with a warning.
    colorScheme: take<UsecaseLayoutConfig['colorScheme']>(
      'colorScheme',
      DEFAULTS.colorScheme,
      DEFAULTS.colorScheme,
      (v) => (v === 'role' || v === 'rotate' ? v : undefined)
    ),
    // Only `false` turns it off.
    useMaxWidth: take('useMaxWidth', DEFAULTS.useMaxWidth, '', (v) => v !== false),
    set,
  };
}
