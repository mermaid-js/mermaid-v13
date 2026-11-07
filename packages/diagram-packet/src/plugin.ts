import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutPacket, type PacketLayout } from './layout/index.ts';
import type { PacketModel } from './model.ts';
import { detectPacket, parsePacket, type PacketParseResult } from './parser/index.ts';
import { renderPacket } from './render/index.ts';
import { packetLabels } from './labels.ts';
import { packetConfigDefaults } from './generated/config-defaults.ts';
import { theme } from './theme/table.ts';

/**
 * The packet diagram plugin (DESIGN §12.1, spec #421): `layoutKind: 'custom'` with its own
 * `PacketLayout`. `parse` takes the whole source and the `packet` config (rows depend on
 * `bitsPerRow`); `layout` measures and places everything on v12's canvas; `render` writes the
 * whole `<svg>` document. The registry loads it from the package's `mermaid` manifest (#462);
 * `configDefaults` are the `packet` section's generated defaults.
 */
export const packet = {
  id: 'packet',
  // Text output is the lazily loaded `./ascii` entry (manifest key `ascii`, #464).
  formats: ['svg', 'ascii'] as const,
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
