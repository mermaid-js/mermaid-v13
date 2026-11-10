import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { usecaseConfigDefaults } from './generated/config-defaults.ts';
import { usecaseIcons, usecaseLabels } from './labels.ts';
import { layoutUsecase, type UsecaseLayout } from './layout/layout.ts';
import type { UsecaseModel } from './model.ts';
import { detectUsecase, parseUsecase, type UsecaseParseResult } from './parser/index.ts';
import { renderUsecase } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The usecase plugin (DESIGN §12.1, spec #517): a graph type (`layoutKind: 'graph'`), laid out
 * with `ctx.layout` (core's `layered` unless `layout` names another engine, R-LAYOUT-7) and drawn
 * through the `SvgWriter` (#566). Its text output (`format: 'ascii'`, T7) is the lazily loaded
 * `./ascii` entry, which draws the same graph laid out in cells (D478). `theme` is the diagram's own table (`theme/table.ts`, D331, D474).
 * The registry loads it from the package's `mermaid` manifest (#567). `configDefaults` are the
 * `usecase` section's generated defaults: v12's `usecase.theme` default `redux-color`, which a
 * `theme` from `initialize()` or the text beats, and no font family, so the families the layout
 * sees are an author's and the rest inherit `fontFamily` (D132).
 */
export const usecase = {
  id: 'usecase',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'graph' as const,
  configDefaults: usecaseConfigDefaults as Readonly<Record<string, unknown>>,
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
