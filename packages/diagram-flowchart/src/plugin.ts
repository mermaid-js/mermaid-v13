import { detectFlowchart, parseFlowchart } from './parser/index.ts';
import type { FlowModel, FlowParseOptions, FlowParseResult } from './parser/index.ts';
import type { SvgWriter } from '@mermaid-js/core/svg';
import type { FlowRenderContext } from './render/context.ts';
import { layoutFlowchart, renderFlowchart, type FlowLayout } from './render/render.ts';

/**
 * The flowchart diagram plugin: what the pipeline (#15) builds on. `parse` takes the whole
 * source (front matter included); every range is into it. `layout` measures and lays out
 * (DESIGN §6.1); `render` writes the whole `<svg>` document into the writer.
 */
export const flowchart = {
  id: 'flowchart',
  aliases: ['graph', 'flowchart-v2', 'flowchart-elk'] as readonly string[],
  layoutKind: 'graph' as const,
  detector: (text: string): boolean => detectFlowchart(text) !== undefined,
  parse: (text: string, options?: FlowParseOptions): FlowParseResult =>
    parseFlowchart(text, options),
  layout: (model: FlowModel, ctx: FlowRenderContext): FlowLayout => layoutFlowchart(model, ctx),
  render: (model: FlowModel, layout: FlowLayout, ctx: FlowRenderContext, w: SvgWriter): void =>
    renderFlowchart(model, layout, ctx, w),
};
