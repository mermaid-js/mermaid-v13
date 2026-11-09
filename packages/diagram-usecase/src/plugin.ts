import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { usecaseIcons, usecaseLabels } from './labels.ts';
import { layoutUsecase, type UsecaseLayout } from './layout/layout.ts';
import type { UsecaseModel } from './model.ts';
import { detectUsecase, parseUsecase, type UsecaseParseResult } from './parser/index.ts';
import { renderUsecase } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The usecase plugin (DESIGN §12.1, spec #517): a graph type (`layoutKind: 'graph'`), laid out
 * with `ctx.layout` (core's `layered` unless `layout` names another engine, R-LAYOUT-7) and drawn
 * through the `SvgWriter` (#566). SVG only until T7. `theme` is the diagram's own table
 * (`theme/table.ts`, D331, D474). The manifest, `configDefaults` and the registry row come with
 * T5 (#567); until then it renders through its own harness (`render/harness.ts`).
 */
export const usecase = {
  id: 'usecase',
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  detector: (text: string): boolean => detectUsecase(text),
  parse: (text: string, ctx: DiagramParseContext): UsecaseParseResult =>
    parseUsecase(text, { preprocessed: ctx.preprocessed }),
  labels: usecaseLabels,
  icons: usecaseIcons,
  layout: (model: UsecaseModel, ctx: RenderContext): UsecaseLayout => layoutUsecase(model, ctx),
  render: (model: UsecaseModel, layout: UsecaseLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderUsecase(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<UsecaseModel, UsecaseLayout>;
