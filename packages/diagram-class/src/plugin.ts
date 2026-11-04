import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { layoutClass, type ClassLayout } from './layout/index.ts';
import { detectClass, parseClass } from './parser/index.ts';
import type { ClassModel, ClassParseResult } from './parser/index.ts';
import type { ClassRenderContext } from './render/context.ts';
import { renderClass } from './render/render.ts';

/** The pipeline's limits, or the ones the integrator config implies (`maxEdges`). */
const limits = (ctx: DiagramParseContext): Readonly<Limits> =>
  ctx.limits ?? resolveLimits(ctx.config);

/**
 * The class diagram plugin (DESIGN §12.1). Its id is its config section, `class`. `parse` takes
 * the whole source (front matter included); `layout` measures and lays out (#155); `render`
 * writes the whole `<svg>` document into the writer. SVG only: there is no text output (D100).
 * Not in the first-party registry until its manifest lands (#157).
 */
export const classDiagram = {
  id: 'class',
  aliases: ['classDiagram', 'classDiagram-v2'] as readonly string[],
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  detector: (text: string): boolean => detectClass(text) !== undefined,
  parse: (text: string, ctx: DiagramParseContext): ClassParseResult => {
    const caps = limits(ctx);
    return parseClass(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
      claims: ctx.claims,
    });
  },
  layout: (model: ClassModel, ctx: ClassRenderContext): ClassLayout => layoutClass(model, ctx),
  render: (model: ClassModel, layout: ClassLayout, ctx: ClassRenderContext, w: SvgWriter): void =>
    renderClass(model, layout, ctx, w),
} satisfies DiagramPlugin<ClassModel, ClassLayout>;
