/**
 * The packet layout's lengths (spec #421 §Layout, pitfall 13): v12's constants in px
 * (`renderer.ts:14-112`, `db.ts:26-28`, `styles.ts:5-16`, `config.schema.yaml`
 * `PacketDiagramConfig`); the `packet` config's defaults are `PACKET_CONFIG_DEFAULTS` (`../config.ts`,
 * #454). The font sizes and the stroke width are packet's theme variables (`plugin.ts`). No other
 * file in `layout/` writes a length literal (`packages/conformance/src/packet-layout-literals.spec.ts`).
 * Packet draws SVG in px (D216).
 */
/** v12's fixed lengths. */
export interface PacketMetrics {
  /** The 1 px margin on each side of a row: v12's width is `bitWidth * bitsPerRow + 2`. */
  readonly margin: number;
  /** `showBits` adds this to `paddingY`, the room for the bit numbers (`db.ts:26-28`). */
  readonly bitsPadding: number;
  /** Bit numbers' baseline sits this far above the row (`renderer.ts:90`). */
  readonly bitNumberGap: number;
  /**
   * The least room between two bit numbers' boxes in a row (D747, #1268): an end number closer
   * than this to another number is dropped. v13's own; below v12's default `paddingX` (5).
   */
  readonly bitNumberSpace: number;
}

export const PACKET_METRICS: PacketMetrics = {
  margin: 1,
  bitsPadding: 10,
  bitNumberGap: 2,
  bitNumberSpace: 2,
};

/** The CSS weight packet text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;

/**
 * D343: a label wider or taller than its piece shrinks, its size scaled by the overflow, at most this many
 * measurements after the first; the last one is at the floor (the bit-number size), since a
 * measurer need not scale with the size.
 */
export const FIT_STEPS = 4;
