import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { agentflowLabels } from './labels.ts';
import { layoutAgentflow, type AgentflowLayout } from './layout/index.ts';
import { parseAgentflow, type AgentflowModel, type AgentflowParseResult } from './parser/index.ts';
import type { AgentflowRenderContext } from './render/context.ts';
import { renderAgentflow } from './render/render.ts';
import { theme } from './theme/table.ts';

/**
 * v12's detector (`afDetector.ts:10`), on the text the pipeline hands `detector` (front matter,
 * directives and comments already removed).
 */
const DETECT = /^\s*agentflow-beta\b/;

/** The pipeline's limits, or the ones the integrator config implies (`maxEdges`). */
const limits = (ctx: DiagramParseContext): Readonly<Limits> =>
  ctx.limits ?? resolveLimits(ctx.config);

/**
 * The agentflow plugin (DESIGN §12.1, spec #523): `layoutKind: 'graph'`, laid out by the
 * engine `layout` config names (D171). `parse` takes the whole source and maps the config keys
 * it honours (D466: `flowchart.inheritDir`; `maxTextSize`) and the integrator's limits
 * (R-SEC-5) to parse options; `claims` silences `CALLBACK_IGNORED` when the interactions plugin
 * binds `click … callback` (D105). `labels` hands every label to core's label layout, which
 * typesets math with the math plugin and warns `MATH_NOT_RENDERED` without it (D176). `render`
 * writes the whole `<svg>` document; `theme` is the diagram's own table (D331). The manifest,
 * registry row and `configDefaults` are #550's (T5).
 */
export const agentflow = {
  id: 'agentflow',
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  theme,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): AgentflowParseResult => {
    const caps = limits(ctx);
    const maxTextSize = ctx.config.maxTextSize;
    return parseAgentflow(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
      maxDepth: caps.maxDepth,
      inheritDir: ctx.config.flowchart?.inheritDir === true,
      ...(typeof maxTextSize === 'number' ? { maxTextSize } : {}),
      claims: ctx.claims,
    });
  },
  labels: agentflowLabels,
  layout: (model: AgentflowModel, ctx: AgentflowRenderContext): AgentflowLayout =>
    layoutAgentflow(model, ctx),
  render: (
    model: AgentflowModel,
    layout: AgentflowLayout,
    ctx: AgentflowRenderContext,
    w: SvgWriter
  ): void => renderAgentflow(model, layout, ctx, w),
} satisfies DiagramPlugin<AgentflowModel, AgentflowLayout>;
