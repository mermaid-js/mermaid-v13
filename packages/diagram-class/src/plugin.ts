import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { layoutClass, type ClassLayout } from './layout/index.ts';
import { detectClass, parseClass } from './parser/index.ts';
import type { ClassModel, ClassParseResult } from './parser/index.ts';
import type { ClassRenderContext } from './render/context.ts';
import { renderClass } from './render/render.ts';
import { classConfigDefaults } from './generated/config-defaults.ts';
import { classLabels } from './labels.ts';
import { theme } from './theme/table.ts';

/** The pipeline's limits, or the ones the integrator config implies (`maxEdges`). */
const limits = (ctx: DiagramParseContext): Readonly<Limits> =>
  ctx.limits ?? resolveLimits(ctx.config);

/**
 * The `class` section's defaults, less `padding` (D125): its documented default, 12, is what
 * v12 padded class boxes with, but v12 padded namespaces 16 and notes 6 when the key was unset
 * (`padding ?? 16`, `?? 6`). Left out, the layout still sees "unset" and draws all three as v12
 * did; an author's `padding` pads all three, as in v12.
 */
const { padding: _documented, ...configDefaults } = classConfigDefaults;

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
    const caps = limits(ctx);
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
