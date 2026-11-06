import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutCynefin, type CynefinLayout } from './layout/index.ts';
import type { CynefinModel } from './model.ts';
import { detectCynefin, parseCynefin, type CynefinParseResult } from './parser/index.ts';
import { renderCynefin } from './render/index.ts';
import { cynefinLabels } from './labels.ts';
import { theme } from './theme/table.ts';
import { cynefinConfigDefaults } from './generated/config-defaults.ts';

/**
 * The cynefin plugin (DESIGN §12.1, spec #423): `layoutKind: 'custom'` with its own
 * `CynefinLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's fixed canvas (D361); `render` writes the whole `<svg>` document. SVG only (D320). The
 * registry loads it from the package's `mermaid` manifest (#469); `configDefaults` are the
 * `cynefin` section's generated defaults, and `theme` is the diagram's own theme table
 * (`theme/table.ts`, D331).
 */
export const cynefin = {
  id: 'cynefin',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  configDefaults: cynefinConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectCynefin(text),
  parse: (text: string, ctx: DiagramParseContext): CynefinParseResult =>
    parseCynefin(text, { preprocessed: ctx.preprocessed }),
  labels: cynefinLabels,
  layout: (model: CynefinModel, ctx: RenderContext): CynefinLayout => layoutCynefin(model, ctx),
  render: (model: CynefinModel, layout: CynefinLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderCynefin(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<CynefinModel, CynefinLayout>;
