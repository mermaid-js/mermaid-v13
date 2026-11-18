import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { requirementConfigDefaults } from './generated/config-defaults.ts';
import { requirementLabels } from './labels.ts';
import type { RequirementRenderContext } from './layout/context.ts';
import { layoutRequirement, type RequirementLayout } from './layout/layout.ts';
import type { RequirementModel } from './model.ts';
import { parseRequirement, type RequirementParseResult } from './parser/index.ts';
import { renderRequirement } from './render/render.ts';
import { theme } from './theme/table.ts';

/**
 * v12's detector (`requirementDetector.ts:10`): case-sensitive, no word boundary, on the text
 * the pipeline hands `detector` (front matter, directives and `%%` comments removed).
 */
const DETECT = /^\s*requirement(Diagram)?/;

/**
 * The requirement diagram plugin (DESIGN §12.1, spec #520). `parse` takes the whole source
 * (front matter included); `layout` checks the style-copy cap (D433), measures every box and
 * label and lays them out with the pipeline's engine (`layoutKind: 'graph'`, D327); `render`
 * writes the whole `<svg>` document; `theme` is the diagram's own table (D331). `configDefaults`
 * are the `requirement` section's generated defaults (`theme: redux-color`, `useMaxWidth`).
 * Text output (`format: 'ascii'`) is the lazily loaded `./ascii` entry (manifest key `ascii`,
 * #588); `layout` sizes in cells when the context's unit profile is the cell one.
 */
export const requirement = {
  id: 'requirement',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'graph' as const,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): RequirementParseResult => {
    const caps = ctx.limits ?? resolveLimits(ctx.config);
    return parseRequirement(text, {
      preprocessed: ctx.preprocessed,
      maxEdges: caps.maxEdges,
      maxNodes: caps.maxNodes,
    });
  },
  labels: requirementLabels,
  layout: (model: RequirementModel, ctx: RequirementRenderContext): RequirementLayout =>
    layoutRequirement(model, ctx),
  render: (
    model: RequirementModel,
    layout: RequirementLayout,
    ctx: RequirementRenderContext,
    w: SvgWriter
  ): void => renderRequirement(model, layout, ctx, w),
  configDefaults: requirementConfigDefaults as Readonly<Record<string, unknown>>,
  theme,
} satisfies DiagramPlugin<RequirementModel, RequirementLayout>;
