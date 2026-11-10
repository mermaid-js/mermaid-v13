import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { blockConfigDefaults } from './generated/config-defaults.ts';
import { layoutBlock, type BlockLayout } from './layout/index.ts';
import { blockLabels } from './labels.ts';
import type { BlockModel } from './model.ts';
import { parseBlock, type BlockParseResult } from './parser/index.ts';
import { renderBlock } from './render/index.ts';

const ignore = (): undefined => undefined;

/** v12's detector (`blockDetector.ts`), on the text v12 gave it: case-sensitive, no boundary. */
const DETECTOR = /^\s*block(-beta)?/;

/**
 * The block plugin (DESIGN §12.1, spec #521): `layoutKind: 'custom'` with its own `BlockLayout`.
 * `parse` takes the whole source and the limits; `layout` measures every label and lays the grid
 * out; `render` writes the whole `<svg>` document (#556). Block has no theme table (spec #521):
 * it reads core's shared rows. The registry loads it from the package's `mermaid` manifest
 * (#558); `configDefaults` are the `block` section's generated defaults. Text output is
 * the lazily loaded `./ascii` entry (manifest key `ascii`, #559).
 */
export const block = {
  id: 'block',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  configDefaults: blockConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => DETECTOR.test(text),
  parse: (text: string, ctx: DiagramParseContext): BlockParseResult =>
    parseBlock(text, {
      preprocessed: ctx.preprocessed,
      ...(ctx.limits
        ? {
            maxNodes: ctx.limits.maxNodes,
            maxEdges: ctx.limits.maxEdges,
            maxDepth: ctx.limits.maxDepth,
          }
        : {}),
    }),
  labels: blockLabels,
  // Text draws its own grid and ignores `block.padding` with no warning (D449): laid out in
  // cells, the px layout (which `postLayout` hooks still see) does not warn about it.
  layout: (model: BlockModel, ctx: RenderContext): BlockLayout =>
    layoutBlock(model, ctx.units.id === 'cell' ? { ...ctx, warn: ignore } : ctx),
  render: (model: BlockModel, layout: BlockLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderBlock(model, layout, ctx, w),
} satisfies DiagramPlugin<BlockModel, BlockLayout>;
