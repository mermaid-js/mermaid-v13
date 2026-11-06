import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { mindmapConfigDefaults } from './generated/config-defaults.ts';
import { mindmapIcons } from './icons.ts';
import type { MindmapLayoutContext } from './layout/context.ts';
import { layoutMindmap, type MindmapLayout } from './layout/layout.ts';
import type { MindmapModel } from './model.ts';
import { detectMindmap, parseMindmap, type MindmapParseResult } from './parser/index.ts';
import type { MindmapRenderContext } from './render/context.ts';
import { renderMindmap } from './render/render.ts';

/**
 * The mindmap plugin (DESIGN §12.1, spec #294): `layoutKind: 'graph'`, laid out by the engine
 * `layout` names, core's `tree` unless a config layer sets another (D284); v12's `cose-bilkent`
 * and `tidy-tree` map to it (D282). `parse` takes the whole source and the integrator's node and
 * depth limits (R-SEC-5); `layout` measures and calls `ctx.layout()` only, so no engine is
 * bundled here; `render` writes the whole `<svg>` document. SVG only (D216). The registry loads
 * it from the package's `mermaid` manifest (#390); `configDefaults` are the `mindmap` section's
 * v12 defaults.
 */
export const mindmap = {
  id: 'mindmap',
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  layoutEngine: { default: 'tree', aliases: { 'cose-bilkent': 'tree', 'tidy-tree': 'tree' } },
  configDefaults: mindmapConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectMindmap(text),
  parse: (text: string, ctx: DiagramParseContext): MindmapParseResult => {
    const caps = ctx.limits ?? resolveLimits(ctx.config);
    return parseMindmap(text, {
      preprocessed: ctx.preprocessed,
      colorBy: ctx.config.mindmap?.colorBy === 'depth' ? 'depth' : 'branch',
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
    });
  },
  labels: (model: MindmapModel): readonly string[] => model.nodes.map((n) => n.label),
  icons: mindmapIcons,
  layout: (model: MindmapModel, ctx: MindmapLayoutContext): MindmapLayout =>
    layoutMindmap(model, ctx),
  render: (
    model: MindmapModel,
    layout: MindmapLayout,
    ctx: MindmapRenderContext,
    w: SvgWriter
  ): void => renderMindmap(model, layout, ctx, w),
} satisfies DiagramPlugin<MindmapModel, MindmapLayout>;
