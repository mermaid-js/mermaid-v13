import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { flowchartConfigDefaults } from './generated/config-defaults.ts';
import { detectFlowchart, parseFlowchart } from './parser/index.ts';
import type { FlowModel, FlowParseResult } from './parser/index.ts';
import type { FlowRenderContext } from './render/context.ts';
import { layoutFlowchart, renderFlowchart, type FlowLayout } from './render/render.ts';

/**
 * The flowchart diagram plugin (DESIGN §12.1). `parse` takes the whole source (front matter
 * included) and maps the config keys it honours (`maxEdges`, `flowchart.inheritDir`) to parse
 * options; every range is into the source. `layout` measures and lays out (DESIGN §6.1);
 * `render` writes the whole `<svg>` document into the writer.
 */
export const flowchart = {
  id: 'flowchart',
  aliases: ['graph', 'flowchart-v2', 'flowchart-elk'] as readonly string[],
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  configDefaults: flowchartConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectFlowchart(text) !== undefined,
  parse: (text: string, ctx: DiagramParseContext): FlowParseResult =>
    parseFlowchart(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: ctx.config.maxEdges,
      inheritDir: ctx.config.flowchart?.inheritDir,
      claims: ctx.claims,
    }),
  layout: (model: FlowModel, ctx: FlowRenderContext): FlowLayout => layoutFlowchart(model, ctx),
  render: (model: FlowModel, layout: FlowLayout, ctx: FlowRenderContext, w: SvgWriter): void =>
    renderFlowchart(model, layout, ctx, w),
} satisfies DiagramPlugin<FlowModel, FlowLayout>;
