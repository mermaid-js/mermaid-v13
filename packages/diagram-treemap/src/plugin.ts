import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutTreemap, type TreemapLayout } from './layout/index.ts';
import type { TreemapModel } from './model.ts';
import { detectTreemap, parseTreemap, type TreemapParseResult } from './parser/index.ts';
import { renderTreemap } from './render/index.ts';
import { theme } from './theme/table.ts';
import { treemapConfigDefaults } from './generated/config-defaults.ts';

/**
 * The treemap plugin (DESIGN §12.1, spec #428): `layoutKind: 'custom'` with its own
 * `TreemapLayout`. `parse` takes the whole source; `layout` tiles, fits and measures everything
 * on v12's canvas; `render` writes the whole `<svg>` document. SVG only (D320).
 *
 * `theme` is treemap's own table (`theme/table.ts`, D322, D331, D406, D407). No `labels`: treemap
 * text is plain (D405) and never goes through core's label layout. The registry loads it from
 * the package's `mermaid` manifest (#514); `configDefaults` are the `treemap` section's generated
 * defaults.
 */
export const treemap = {
  id: 'treemap',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: treemapConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectTreemap(text),
  parse: (text: string, ctx: DiagramParseContext): TreemapParseResult =>
    parseTreemap(text, { preprocessed: ctx.preprocessed }),
  layout: (model: TreemapModel, ctx: RenderContext): TreemapLayout => layoutTreemap(model, ctx),
  render: (model: TreemapModel, layout: TreemapLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderTreemap(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<TreemapModel, TreemapLayout>;
