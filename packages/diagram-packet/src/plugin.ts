// cspell:words pkbz pklz pktz pkbw
import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { DiagramThemeEntries, DiagramThemeTable } from '@mermaid-js/core/theme';
import { layoutPacket, type PacketLayout } from './layout/index.ts';
import type { PacketModel } from './model.ts';
import { detectPacket, parsePacket, type PacketParseResult } from './parser/index.ts';
import { renderPacket } from './render/index.ts';
import { packetLabels } from './labels.ts';
import { packetConfigDefaults } from './generated/config-defaults.ts';

// Packet's theme table (D331, D335, D540, spec #421 "v13 entries"), declared inline until
// T0b's per-package file convention lands: v12's ten `packet.*` style options
// (`styles.ts:5-16`) as flat variables in section `packet`, so
// `themeVariables.packet.labelColor` sets `packetLabelColor`. It names no theme (D331): every
// family takes the light entry (v12's literals) and, in its dark themes (the `dark` trait, not
// the author's `darkMode`, as v12 keyed packet by theme), the dark entry (v12 `dark`'s
// `primaryTextColor` inks on `background`). The lengths are the same in every theme.

/** The light entry's colours (v12 `styles.ts`): the fallback under every theme. */
const LIGHT = {
  packetStartByteColor: 'black',
  packetEndByteColor: 'black',
  packetLabelColor: 'black',
  packetTitleColor: 'black',
  packetBlockStrokeColor: 'black',
  packetBlockFillColor: '#efefef',
} as const;

/** v12 `styles.ts`'s lengths in px; the dark entry falls back to them. */
const LENGTHS = {
  packetByteFontSize: 10,
  packetLabelFontSize: 12,
  packetTitleFontSize: 14,
  packetBlockStrokeWidth: 1,
} as const;

/** The dark entry (v12 `theme-dark.js:328-335`), over the light one in a family's dark themes. */
const DARK: DiagramThemeEntries = {
  rules: {
    packetStartByteColor: 'primaryTextColor',
    packetEndByteColor: 'primaryTextColor',
    packetLabelColor: 'primaryTextColor',
    packetTitleColor: 'primaryTextColor',
    packetBlockStrokeColor: 'primaryTextColor',
    packetBlockFillColor: 'background',
  },
};

/**
 * Packet draws alike in every family (D227): v12's lengths, and the dark colours in the family's
 * dark themes.
 */
const ENTRIES_FOR_EVERY_FAMILY = { tokens: LENGTHS, dark: DARK };

const theme: DiagramThemeTable = {
  section: 'packet',
  vars: {
    packetStartByteColor: { alias: 'pks', kind: 'color', nested: 'startByteColor' },
    packetEndByteColor: { alias: 'pke', kind: 'color', nested: 'endByteColor' },
    packetLabelColor: { alias: 'pkl', kind: 'color', nested: 'labelColor' },
    packetTitleColor: { alias: 'pkt', kind: 'color', nested: 'titleColor' },
    packetBlockStrokeColor: { alias: 'pkb', kind: 'color', nested: 'blockStrokeColor' },
    packetBlockFillColor: { alias: 'pkf', kind: 'color', nested: 'blockFillColor' },
    packetByteFontSize: { alias: 'pkbz', kind: 'length', nested: 'byteFontSize' },
    packetLabelFontSize: { alias: 'pklz', kind: 'length', nested: 'labelFontSize' },
    packetTitleFontSize: { alias: 'pktz', kind: 'length', nested: 'titleFontSize' },
    packetBlockStrokeWidth: { alias: 'pkbw', kind: 'length', nested: 'blockStrokeWidth' },
  },
  rules: { light: LIGHT },
  families: {
    classic: ENTRIES_FOR_EVERY_FAMILY,
    redux: ENTRIES_FOR_EVERY_FAMILY,
    // Not `{ fallback: 'redux' }`: the direction check reads the literal as the theme `redux`.
    neo: ENTRIES_FOR_EVERY_FAMILY,
  },
};

/**
 * The packet diagram plugin (DESIGN §12.1, spec #421): `layoutKind: 'custom'` with its own
 * `PacketLayout`. `parse` takes the whole source and the `packet` config (rows depend on
 * `bitsPerRow`); `layout` measures and places everything on v12's canvas; `render` writes the
 * whole `<svg>` document. SVG only. The registry loads it from the package's `mermaid` manifest
 * (#462); `configDefaults` are the `packet` section's generated defaults.
 */
export const packet = {
  id: 'packet',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: { ...packetConfigDefaults },
  theme,
  detector: (text: string): boolean => detectPacket(text),
  parse: (text: string, ctx: DiagramParseContext): PacketParseResult =>
    parsePacket(text, { preprocessed: ctx.preprocessed, config: ctx.config.packet }),
  labels: packetLabels,
  layout: (model: PacketModel, ctx: RenderContext): PacketLayout => layoutPacket(model, ctx),
  render: (model: PacketModel, layout: PacketLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderPacket(model, layout, ctx, w),
} satisfies DiagramPlugin<PacketModel, PacketLayout>;
