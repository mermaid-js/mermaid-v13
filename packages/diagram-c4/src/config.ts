/**
 * The `c4` options the layout reads (spec #522 §Layout, D454), with v12's schema defaults
 * (`C4DiagramConfig`). The config resolver does not check value types (a directive can set
 * `"width": "wide"`), so a length the layout cannot use falls back to its default: a length is a
 * number, or a numeric string as its number, at least the schema's `minimum`; a row count is an
 * integer of at least 1 (v12's DB kept an `UpdateLayoutConfig` value only then).
 *
 * `c4ShapeInRow` and `c4BoundaryInRow` are defaults that `UpdateLayoutConfig` overrides (D454;
 * v12's DB hard-coded 4 and 2). `height`, `boxMargin` and `wrapPadding` are not read (v12 never
 * read them, D454). Font families take the theme's `fontFamily` unless set (sequence's
 * precedent); a family the style check refuses is dropped with a `STYLE_VALUE_DROPPED` warning.
 * Element text wraps when the root `wrap` is true, or when it is unset and `c4.wrap` (default
 * true) is: the root `wrap`, when set, wins (#683, as v12's fix mermaid-js/mermaid#8342; 12.2.0's
 * elements followed `c4.wrap` alone). Relation and boundary text wraps only when the root `wrap`
 * is true, as v12.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { C4DiagramConfig } from '@mermaid-js/core/config';
import { checkStyle } from '@mermaid-js/core/svg';
import { fontSizePx, type FontKey } from '@mermaid-js/core/text';
import { configNumber } from '@mermaid-js/core/config/readers';
import { c4betaConfigDefaults, c4ConfigDefaults } from './generated/config-defaults.ts';
import { FONT_WEIGHT } from './layout/metrics.ts';
import { C4_ELEMENT_KINDS, type C4ElementKind } from './model.ts';
import type { C4BetaElementKind } from './beta/model.ts';

/** The `c4` lengths, row counts and flags the layout reads, every one set. */
export interface C4LayoutConfig {
  readonly diagramMarginX: number;
  readonly diagramMarginY: number;
  readonly c4ShapeMargin: number;
  readonly c4ShapePadding: number;
  /** The least width of an element (v12 `c4.width`). */
  readonly width: number;
  readonly nextLinePaddingX: number;
  readonly c4ShapeInRow: number;
  readonly c4BoundaryInRow: number;
  /** Element text wraps: the root `wrap` when set, else `c4.wrap`. */
  readonly wrap: boolean;
  /** The root `wrap` is true: relation and boundary text wraps too. */
  readonly wrapAll: boolean;
}

/**
 * The `c4` section's default for `key`: the generated section defaults (`gen:config`, from the
 * schema's `C4DiagramConfig`), the one place a default lives. A key the schema gives no default
 * throws.
 */
export function c4Default<K extends keyof C4DiagramConfig>(
  key: K
): NonNullable<C4DiagramConfig[K]> {
  const value = c4ConfigDefaults[key];
  if (value === undefined) throw new Error(`The c4 config section has no default for ${key}`);
  return value as NonNullable<C4DiagramConfig[K]>;
}

/** The `C4DiagramConfig` defaults the layout falls back to. */
export const C4_CONFIG_DEFAULTS: Omit<C4LayoutConfig, 'wrapAll'> = {
  diagramMarginX: c4Default('diagramMarginX'),
  diagramMarginY: c4Default('diagramMarginY'),
  c4ShapeMargin: c4Default('c4ShapeMargin'),
  c4ShapePadding: c4Default('c4ShapePadding'),
  width: c4Default('width'),
  nextLinePaddingX: c4Default('nextLinePaddingX'),
  c4ShapeInRow: c4Default('c4ShapeInRow'),
  c4BoundaryInRow: c4Default('c4BoundaryInRow'),
  wrap: c4Default('wrap'),
};

/**
 * The lengths a value below `LENGTH_MIN` falls back for: the schema's `minimum` for each, checked
 * against it in `conformance/src/c4-layout-literals.spec.ts` (`nextLinePaddingX` has none).
 */
const LENGTHS = [
  'diagramMarginX',
  'diagramMarginY',
  'c4ShapeMargin',
  'c4ShapePadding',
  'width',
] as const;
const LENGTH_MIN = 0;

/** The section the layout reads from the resolved config. */
export function c4Section(config: RenderContext['config']): Readonly<Record<string, unknown>> {
  const section = (config as { c4?: unknown }).c4;
  return section !== null && typeof section === 'object'
    ? (section as Readonly<Record<string, unknown>>)
    : {};
}

/** The `c4beta` section from the resolved config (spec #730 T1; c4-beta reads this alone). */
export function c4betaSection(config: RenderContext['config']): Readonly<Record<string, unknown>> {
  const section = (config as { c4beta?: unknown }).c4beta;
  return section !== null && typeof section === 'object'
    ? (section as Readonly<Record<string, unknown>>)
    : {};
}

/**
 * The margin round a c4-beta drawing: `c4beta.diagramPadding` when it is a number (or a numeric
 * string) of at least 0, else the schema's default (`gen:config`, from `C4BetaDiagramConfig`).
 */
export function c4betaDiagramPadding(config: RenderContext['config']): number {
  const fallback = c4betaConfigDefaults.diagramPadding;
  if (fallback === undefined) throw new Error('The c4beta config section has no diagramPadding');
  return configNumber(c4betaSection(config).diagramPadding, 0) ?? fallback;
}

/**
 * Whether an element of `kind` shows its type line: `c4beta.showStereotypes` is not `false` and
 * `c4beta.hideStereotypes`, when it is a list, does not name the kind. A value of another type
 * hides nothing (spec #730 T5).
 */
export function c4betaStereotypeShown(
  config: RenderContext['config']
): (kind: C4BetaElementKind) => boolean {
  const { showStereotypes, hideStereotypes } = c4betaSection(config);
  const hidden: readonly unknown[] = Array.isArray(hideStereotypes) ? hideStereotypes : [];
  return (kind) => showStereotypes !== false && !hidden.includes(kind);
}

/** The layout's options from the resolved config. */
export function c4LayoutConfig(config: RenderContext['config']): C4LayoutConfig {
  const given = c4Section(config);
  const out: Record<string, number | boolean> = { ...C4_CONFIG_DEFAULTS };
  for (const key of LENGTHS) {
    const n = configNumber(given[key]);
    if (n !== undefined && n >= LENGTH_MIN) out[key] = n;
  }
  const nextLine = configNumber(given.nextLinePaddingX);
  if (nextLine !== undefined) out.nextLinePaddingX = nextLine;
  for (const key of ['c4ShapeInRow', 'c4BoundaryInRow'] as const) {
    const n = configNumber(given[key]);
    if (n !== undefined && Number.isInteger(n) && n >= 1) out[key] = n;
  }
  // The root `wrap`, when set, wins over `c4.wrap` (#683, as v12's fix mermaid-js/mermaid#8342).
  const root = (config as { wrap?: unknown }).wrap;
  const section = typeof given.wrap === 'boolean' ? given.wrap : C4_CONFIG_DEFAULTS.wrap;
  const wrap = typeof root === 'boolean' ? root : section;
  return {
    ...(out as unknown as Omit<C4LayoutConfig, 'wrap' | 'wrapAll'>),
    wrap,
    wrapAll: root === true,
  };
}

/** A CSS font weight as a number: `bold` and `bolder` are 700, anything else not a number 400. */
function weightOf(value: unknown): number {
  if (value === 'bold' || value === 'bolder') return FONT_WEIGHT.bold;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : FONT_WEIGHT.normal;
}

/** The fonts text is measured in, and so drawn in: by element kind, and for boundaries and relations. */
export interface C4Fonts {
  readonly element: (kind: C4ElementKind) => FontKey;
  readonly boundary: FontKey;
  readonly message: FontKey;
}

/**
 * The `<prefix>FontFamily`, `FontSize` and `FontWeight` fonts of the `c4` section. A family
 * the style check refuses falls back to the theme's, with one warning per key.
 */
export function c4Fonts(
  config: RenderContext['config'],
  family: string,
  warn: (w: Warning) => void
): C4Fonts {
  const c4 = c4Section(config);
  const font = (prefix: string): FontKey => {
    // A size that is not one falls back to the key's own default (14; 12 for `message`).
    const size = Number(c4Default(`${prefix}FontSize` as keyof C4DiagramConfig));
    const key = `${prefix}FontFamily`;
    const f = c4[key];
    let safe: string | undefined;
    if (typeof f === 'string' && f.trim() !== '') {
      safe = checkStyle(['font-family:' + f]).text['font-family'] as string | undefined;
      if (safe === undefined)
        warn({
          code: 'STYLE_VALUE_DROPPED',
          message: `Dropped c4.${key} ${JSON.stringify(f)}: it is not a font family Mermaid allows`,
          path: `c4.${key}`,
        });
    }
    const s = fontSizePx(c4[`${prefix}FontSize`], size);
    return {
      family: safe ?? family,
      size: s !== undefined && s > 0 ? s : size,
      weight: weightOf(c4[`${prefix}FontWeight`]),
    };
  };
  const elements = new Map(C4_ELEMENT_KINDS.map((k) => [k, font(k)]));
  return {
    element: (kind) => elements.get(kind) ?? elements.get('person')!,
    boundary: font('boundary'),
    message: font('message'),
  };
}
