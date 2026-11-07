import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import { flowchartConfigDefaults } from './generated/config-defaults.ts';
import { detectFlowchart, parseFlowchart } from './parser/index.ts';
import type { FlowModel, FlowParseResult } from './parser/index.ts';
import type { FlowRenderContext } from './render/context.ts';
import { layoutFlowchart, renderFlowchart, type FlowLayout } from './render/render.ts';
import { flowchartIcons, flowchartLabels } from './labels.ts';
import { theme } from './theme/table.ts';

/** The pipeline's limits, or the ones the integrator config implies (`maxEdges`). */
const limits = (ctx: DiagramParseContext): Readonly<Limits> =>
  ctx.limits ?? resolveLimits(ctx.config);

/**
 * The flowchart diagram plugin (DESIGN §12.1). `parse` takes the whole source (front matter
 * included) and maps the config keys it honours (`maxEdges`, `flowchart.inheritDir`) to parse
 * options; every range is into the source. `layout` measures and lays out (DESIGN §6.1);
 * `render` writes the whole `<svg>` document into the writer.
 */
export const flowchart = {
  id: 'flowchart',
  aliases: ['graph', 'flowchart-v2', 'flowchart-elk'] as readonly string[],
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'graph' as const,
  configDefaults: flowchartConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectFlowchart(text) !== undefined,
  parse: (text: string, ctx: DiagramParseContext): FlowParseResult => {
    const caps = limits(ctx);
    return parseFlowchart(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
      inheritDir: ctx.config.flowchart?.inheritDir,
      claims: ctx.claims,
    });
  },
  labels: flowchartLabels,
  icons: flowchartIcons,
  layout: (model: FlowModel, ctx: FlowRenderContext): FlowLayout => layoutFlowchart(model, ctx),
  render: (model: FlowModel, layout: FlowLayout, ctx: FlowRenderContext, w: SvgWriter): void =>
    renderFlowchart(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<FlowModel, FlowLayout>;
