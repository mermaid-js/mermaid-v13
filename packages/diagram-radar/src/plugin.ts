import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutRadar, type RadarLayout } from './layout/index.ts';
import type { RadarModel } from './model.ts';
import { detectRadar, parseRadar, type RadarParseResult } from './parser/index.ts';
import { radarLabels } from './labels.ts';
import { renderRadar } from './render/index.ts';
import { radarConfigDefaults } from './generated/config-defaults.ts';
import { theme } from './theme/table.ts';

/**
 * The radar chart plugin (DESIGN §12.1, spec #422): `layoutKind: 'custom'` with its own
 * `RadarLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's canvas; `render` writes the whole `<svg>` document. SVG only (D320).
 *
 * `theme` is radar's own table (`theme/table.ts`, D322, D331) over the ten `radar*` variables of
 * `theme/vocabulary.ts`. The registry loads it from the package's `mermaid` manifest (#449);
 * `configDefaults` are the `radar` section's generated defaults.
 */
export const radar = {
  id: 'radar',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: radarConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectRadar(text),
  parse: (text: string, ctx: DiagramParseContext): RadarParseResult =>
    parseRadar(text, {
      preprocessed: ctx.preprocessed,
      maxNodes: (ctx.limits ?? resolveLimits(ctx.config)).maxNodes,
    }),
  labels: radarLabels,
  layout: (model: RadarModel, ctx: RenderContext): RadarLayout => layoutRadar(model, ctx),
  render: (model: RadarModel, layout: RadarLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderRadar(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<RadarModel, RadarLayout>;
