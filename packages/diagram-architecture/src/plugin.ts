import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { architectureConfigDefaults } from './generated/config-defaults.ts';
import { architectureIcons, architectureLabels } from './icons.ts';
import { layoutArchitecture, type ArchitectureLayout } from './layout/layout.ts';
import type { ArchitectureModel } from './model.ts';
import {
  detectArchitecture,
  parseArchitecture,
  type ArchitectureParseResult,
} from './parser/index.ts';
import { renderArchitecture } from './render/render.ts';
import { theme } from './theme/table.ts';

/**
 * The architecture plugin (DESIGN §12.1, spec #525): `layoutKind: 'graph'`, laid out by the
 * engine `layout` names, `compass` unless a config layer sets another (D284, D326). `parse` takes
 * the whole source; `layout` measures and calls `ctx.layout()` only, so no engine is bundled
 * here; `render` writes the whole `<svg>` document. SVG only (D320). `icons` lists the pack icons
 * an icons extension should load (D505); `labels` every text label layout sees. `theme` is the
 * package's table over v12's five `arch*` variables (D331). The registry loads it from the
 * package's `mermaid` manifest (#618); `configDefaults` are the `architecture` section's generated
 * defaults (the six fcose keys and `fontSize` among them, which nothing reads: D328, D507).
 */
export const architecture = {
  id: 'architecture',
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  layoutEngine: { default: 'compass' },
  configDefaults: architectureConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectArchitecture(text),
  parse: (text: string, ctx: DiagramParseContext): ArchitectureParseResult => {
    const { maxNodes, maxEdges, maxDepth } = ctx.limits ?? resolveLimits(ctx.config);
    return parseArchitecture(text, {
      preprocessed: ctx.preprocessed,
      maxNodes,
      maxEdges,
      maxDepth,
    });
  },
  labels: architectureLabels,
  icons: architectureIcons,
  layout: (model: ArchitectureModel, ctx: RenderContext): ArchitectureLayout =>
    layoutArchitecture(model, ctx),
  render: (
    model: ArchitectureModel,
    layout: ArchitectureLayout,
    ctx: RenderContext,
    w: SvgWriter
  ): void => renderArchitecture(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<ArchitectureModel, ArchitectureLayout>;
