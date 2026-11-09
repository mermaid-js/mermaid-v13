import type { DiagramParseContext, DiagramPlugin } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
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
 * writes the whole `<svg>` document; `theme` is the diagram's own table (D331). T5 (#587) adds
 * `configDefaults` and the manifest.
 */
export const requirement = {
  id: 'requirement',
  formats: ['svg'] as const,
  layoutKind: 'graph' as const,
  detector: (text: string): boolean => DETECT.test(text),
  parse: (text: string, ctx: DiagramParseContext): RequirementParseResult =>
    parseRequirement(text, { preprocessed: ctx.preprocessed }),
  labels: requirementLabels,
  layout: (model: RequirementModel, ctx: RequirementRenderContext): RequirementLayout =>
    layoutRequirement(model, ctx),
  render: (
    model: RequirementModel,
    layout: RequirementLayout,
    ctx: RequirementRenderContext,
    w: SvgWriter
  ): void => renderRequirement(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<RequirementModel, RequirementLayout>;
