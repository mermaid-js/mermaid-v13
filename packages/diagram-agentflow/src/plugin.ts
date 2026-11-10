import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import { resolveLimits, type Limits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { agentflowConfigDefaults } from './generated/config-defaults.ts';
import { agentflowLabels } from './labels.ts';
import { layoutAgentflow, type AgentflowLayout } from './layout/index.ts';
import { detectAgentflow } from './parser/detect.ts';
import { parseAgentflow, type AgentflowModel, type AgentflowParseResult } from './parser/index.ts';
import type { AgentflowRenderContext } from './render/context.ts';
import { renderAgentflow } from './render/render.ts';
import { theme } from './theme/table.ts';

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
 * writes the whole `<svg>` document; `theme` is the diagram's own table (D331). `configDefaults`
 * are the `agentflow` section's generated defaults; the manifest in package.json gives the
 * registry row (#550). Text output (`format: 'ascii'`) is the lazily loaded `./ascii` entry
 * (#551, D469): the pipeline lays out in cells through this `layout`, then calls its hook.
 */
export const agentflow = {
  id: 'agentflow',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'graph' as const,
  configDefaults: agentflowConfigDefaults as Readonly<Record<string, unknown>>,
  theme,
  detector: detectAgentflow,
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
