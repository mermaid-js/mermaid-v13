import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
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
 * package's table over v12's five `arch*` variables (D331). The manifest that registers it is
 * T5's (#618).
 */
export const architecture = {
  id: 'architecture',
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  layoutEngine: { default: 'compass' },
  detector: (text: string): boolean => detectArchitecture(text),
  parse: (text: string, ctx: DiagramParseContext): ArchitectureParseResult =>
    parseArchitecture(text, { preprocessed: ctx.preprocessed }),
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
