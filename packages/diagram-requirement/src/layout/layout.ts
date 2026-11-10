import type { LayoutModel } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import { checkStyleCopies } from '../limits.ts';
import type { RequirementModel } from '../model.ts';
import type { RequirementRenderContext } from './context.ts';
import { prepareRequirement, type RequirementPrepared } from './prepare.ts';

/** The requirement layout: the engine's LayoutModel, plus the measured views when they are fresh. */
export interface RequirementLayout extends LayoutModel {
  /** Set by `layoutRequirement`; a `postLayout` hook that builds a new model drops it. */
  readonly requirement?: RequirementPrepared;
}

/**
 * Measures the model and lays it out with `ctx.layout` (default `layered`). A model past the
 * style-copy cap ends here, before any measuring, in the cap's `LimitError` (D433), as gantt's
 * step limit does.
 */
export function layoutRequirement(
  model: RequirementModel,
  ctx: RequirementRenderContext
): RequirementLayout {
  checkStyleCopies(model);
  const prepared = prepareRequirement(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  return { ...laid, requirement: prepared };
}
