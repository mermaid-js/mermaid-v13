import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: packet reads them all. */
const PACKET: readonly string[] = ['packet'];

/**
 * Packet's theme variables (spec #421 "v13 entries", D331, D335, D540; spec #414 T0b): v12's
 * ten `packet.*` style options (`styles.ts:5-16`) as flat variables, each with its key under the
 * table's `packet` section, so `themeVariables.packet.labelColor` sets `packetLabelColor`.
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  packetStartByteColor: { alias: 'pks', kind: 'color', usedBy: PACKET, nested: 'startByteColor' },
  packetEndByteColor: { alias: 'pke', kind: 'color', usedBy: PACKET, nested: 'endByteColor' },
  packetLabelColor: { alias: 'pkl', kind: 'color', usedBy: PACKET, nested: 'labelColor' },
  packetTitleColor: { alias: 'pkt', kind: 'color', usedBy: PACKET, nested: 'titleColor' },
  packetBlockStrokeColor: {
    alias: 'pkb',
    kind: 'color',
    usedBy: PACKET,
    nested: 'blockStrokeColor',
  },
  packetBlockFillColor: { alias: 'pkf', kind: 'color', usedBy: PACKET, nested: 'blockFillColor' },
  packetByteFontSize: { alias: 'pkbz', kind: 'length', usedBy: PACKET, nested: 'byteFontSize' },
  packetLabelFontSize: { alias: 'pklz', kind: 'length', usedBy: PACKET, nested: 'labelFontSize' },
  packetTitleFontSize: { alias: 'pktz', kind: 'length', usedBy: PACKET, nested: 'titleFontSize' },
  packetBlockStrokeWidth: {
    alias: 'pkbw',
    kind: 'length',
    usedBy: PACKET,
    nested: 'blockStrokeWidth',
  },
};
