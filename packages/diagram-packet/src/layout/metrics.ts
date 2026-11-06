/**
 * The packet layout's lengths (spec #421 §Layout, pitfall 13): v12's constants in px
 * (`renderer.ts:14-112`, `db.ts:26-28`, `styles.ts:5-16`, `config.schema.yaml`
 * `PacketDiagramConfig`); the `packet` config's defaults are `PACKET_CONFIG_DEFAULTS` (`../config.ts`,
 * #454). No other file in `layout/` writes a length literal
 * (`packages/conformance/src/packet-layout-literals.spec.ts`). Packet draws SVG in px (D216).
 */
import type { Theme } from '@mermaid-js/core/theme';

/** v12's fixed lengths. */
export interface PacketMetrics {
  /** The 1 px margin on each side of a row: v12's width is `bitWidth * bitsPerRow + 2`. */
  readonly margin: number;
  /** `showBits` adds this to `paddingY`, the room for the bit numbers (`db.ts:26-28`). */
  readonly bitsPadding: number;
  /** Bit numbers' baseline sits this far above the row (`renderer.ts:90`). */
  readonly bitNumberGap: number;
}

export const PACKET_METRICS: PacketMetrics = {
  margin: 1,
  bitsPadding: 10,
  bitNumberGap: 2,
};

/**
 * Packet's own length variables (#421 T4 declares them in the package's theme table) and v12's
 * defaults (`styles.ts:5-16`): the fonts are 10 px (bit numbers), 12 px (labels), 14 px (title).
 */
export const PACKET_THEME_DEFAULTS = {
  packetByteFontSize: 10,
  packetLabelFontSize: 12,
  packetTitleFontSize: 14,
  packetBlockStrokeWidth: 1,
} as const;

export type PacketThemeLength = keyof typeof PACKET_THEME_DEFAULTS;

/**
 * A packet length variable in px: the theme's value once packet's table declares it (T4), else
 * v12's default. A value that is not a finite length above zero takes the default too.
 */
export function packetThemeLength(theme: Pick<Theme, 'number'>, name: PacketThemeLength): number {
  let v: number;
  try {
    v = theme.number(name);
  } catch {
    // `Unknown theme variable` until the table declares it.
    return PACKET_THEME_DEFAULTS[name];
  }
  return Number.isFinite(v) && v > 0 ? v : PACKET_THEME_DEFAULTS[name];
}

/** The CSS weight packet text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;

/**
 * D343: a label wider than its piece shrinks, its size scaled by the fit; this many steps at
 * most, since a measurer need not scale exactly with the size.
 */
export const FIT_STEPS = 4;
