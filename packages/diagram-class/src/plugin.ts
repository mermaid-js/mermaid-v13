import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { resolveLimits } from '@mermaid-js/core/limits';
import { layoutClass, type ClassLayout } from './layout/index.ts';
import { detectClass, parseClass } from './parser/index.ts';
import type { ClassModel, ClassParseResult } from './parser/index.ts';
import type { ClassRenderContext } from './render/context.ts';
import { renderClass } from './render/render.ts';
import { configDefaults } from './config-defaults.ts';
import { classLabels } from './labels.ts';
import { theme } from './theme/table.ts';

/**
 * The class diagram plugin (DESIGN §12.1). Its id is its config section, `class`. `parse` takes
 * the whole source (front matter included); `layout` measures and lays out (#155); `render`
 * writes the whole `<svg>` document into the writer. SVG only: there is no text output (D100).
 * Registered by the package's `mermaid` manifest (#157).
 */
export const classDiagram = {
  id: 'class',
  aliases: ['classDiagram', 'classDiagram-v2'] as readonly string[],
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  configDefaults: configDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectClass(text) !== undefined,
  parse: (text: string, ctx: DiagramParseContext): ClassParseResult => {
    const caps = ctx.limits ?? resolveLimits(ctx.config);
    return parseClass(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
      claims: ctx.claims,
    });
  },
  labels: classLabels,
  layout: (model: ClassModel, ctx: ClassRenderContext): ClassLayout => layoutClass(model, ctx),
  render: (model: ClassModel, layout: ClassLayout, ctx: ClassRenderContext, w: SvgWriter): void =>
    renderClass(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<ClassModel, ClassLayout>;
