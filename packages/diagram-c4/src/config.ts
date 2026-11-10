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
 * Element text wraps when `c4.wrap` (default true); relation and boundary text only when the
 * root `wrap` is set too, as v12.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { checkStyle } from '@mermaid-js/core/svg';
import { fontSizePx, type FontKey } from '@mermaid-js/core/text';
import { FONT_WEIGHT } from './layout/metrics.ts';
import type { C4ElementKind } from './model.ts';

/** The ten base element kinds; each has an `external_` twin. */
const BASE_KINDS = [
  'person',
  'system',
  'system_db',
  'system_queue',
  'container',
  'container_db',
  'container_queue',
  'component',
  'component_db',
  'component_queue',
] as const satisfies readonly C4ElementKind[];

/** The twenty element kinds, each with its own font keys (v12 `C4_ELEMENT_TYPES`). */
export const C4_ELEMENT_KINDS: readonly C4ElementKind[] = BASE_KINDS.flatMap((kind) => [
  kind,
  `external_${kind}` as const,
]);

/** The ten external kinds (v12's `c4-external` class). */
export const C4_EXTERNAL_KINDS: ReadonlySet<C4ElementKind> = new Set(
  BASE_KINDS.map((kind) => `external_${kind}` as const)
);

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
  /** `c4.wrap`: element text wraps. */
  readonly wrap: boolean;
  /** `c4.wrap` and the root `wrap`: relation and boundary text wraps too. */
  readonly wrapAll: boolean;
}

/** The `C4DiagramConfig` defaults the layout falls back to. */
export const C4_CONFIG_DEFAULTS: Omit<C4LayoutConfig, 'wrapAll'> = {
  diagramMarginX: 50,
  diagramMarginY: 10,
  c4ShapeMargin: 50,
  c4ShapePadding: 20,
  width: 216,
  nextLinePaddingX: 0,
  c4ShapeInRow: 4,
  c4BoundaryInRow: 2,
  wrap: true,
};

/** v12's font size for every element kind and boundaries, and for relations (`message`). */
export const C4_FONT_SIZE = 14;
export const C4_MESSAGE_FONT_SIZE = 12;

/** The lengths' least values (the schema's `minimum`; `nextLinePaddingX` has none). */
const LENGTHS = [
  'diagramMarginX',
  'diagramMarginY',
  'c4ShapeMargin',
  'c4ShapePadding',
  'width',
] as const;

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** The section the layout reads from the resolved config. */
export function c4Section(config: RenderContext['config']): Readonly<Record<string, unknown>> {
  const section = (config as { c4?: unknown }).c4;
  return section !== null && typeof section === 'object'
    ? (section as Readonly<Record<string, unknown>>)
    : {};
}

/** The layout's options from the resolved config. */
export function c4LayoutConfig(config: RenderContext['config']): C4LayoutConfig {
  const given = c4Section(config);
  const out: Record<string, number | boolean> = { ...C4_CONFIG_DEFAULTS };
  for (const key of LENGTHS) {
    const n = configNumber(given[key]);
    if (n !== undefined && n >= 0) out[key] = n;
  }
  const nextLine = configNumber(given.nextLinePaddingX);
  if (nextLine !== undefined) out.nextLinePaddingX = nextLine;
  for (const key of ['c4ShapeInRow', 'c4BoundaryInRow'] as const) {
    const n = configNumber(given[key]);
    if (n !== undefined && Number.isInteger(n) && n >= 1) out[key] = n;
  }
  const wrap = typeof given.wrap === 'boolean' ? given.wrap : C4_CONFIG_DEFAULTS.wrap;
  return {
    ...(out as unknown as Omit<C4LayoutConfig, 'wrap' | 'wrapAll'>),
    wrap,
    wrapAll: wrap && (config as { wrap?: unknown }).wrap === true,
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
  const font = (prefix: string, size: number): FontKey => {
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
  const elements = new Map(C4_ELEMENT_KINDS.map((k) => [k, font(k, C4_FONT_SIZE)]));
  return {
    element: (kind) => elements.get(kind) ?? elements.get('person')!,
    boundary: font('boundary', C4_FONT_SIZE),
    message: font('message', C4_MESSAGE_FONT_SIZE),
  };
}

/**
 * The element palette's defaults, `[bg, border]` by kind: the schema's `<kind>_bg_color` and
 * `<kind>_border_color` (`C4DiagramConfig`), drawn where the config leaves a key unset or sets
 * one that is not a colour.
 */
export const C4_ELEMENT_COLORS: Readonly<
  Record<C4ElementKind, readonly [bg: string, border: string]>
> = {
  person: ['#08427B', '#073B6F'],
  external_person: ['#686868', '#8A8A8A'],
  system: ['#1168BD', '#3C7FC0'],
  external_system: ['#999999', '#8A8A8A'],
  system_db: ['#1168BD', '#3C7FC0'],
  external_system_db: ['#999999', '#8A8A8A'],
  system_queue: ['#1168BD', '#3C7FC0'],
  external_system_queue: ['#999999', '#8A8A8A'],
  container: ['#438DD5', '#3C7FC0'],
  external_container: ['#B3B3B3', '#A6A6A6'],
  container_db: ['#438DD5', '#3C7FC0'],
  external_container_db: ['#B3B3B3', '#A6A6A6'],
  container_queue: ['#438DD5', '#3C7FC0'],
  external_container_queue: ['#B3B3B3', '#A6A6A6'],
  component: ['#85BBF0', '#78A8D8'],
  external_component: ['#CCCCCC', '#BFBFBF'],
  component_db: ['#85BBF0', '#78A8D8'],
  external_component_db: ['#CCCCCC', '#BFBFBF'],
  component_queue: ['#85BBF0', '#78A8D8'],
  external_component_queue: ['#CCCCCC', '#BFBFBF'],
};
