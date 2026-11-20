import type { LayoutModel } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import type { ErModel } from '../parser/index.ts';
import type { ErRenderContext } from './context.ts';
import { prepareEr, type ErPrepared } from './prepare.ts';

/** The ER layout: the engine's LayoutModel, plus the measured views when they are fresh. */
export interface ErLayout extends LayoutModel {
  /** Set by `layoutEr`; a `postLayout` hook that builds a new model drops it. */
  readonly er?: ErPrepared;
}

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutEr(model: ErModel, ctx: ErRenderContext): ErLayout {
  const prepared = prepareEr(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  return { ...laid, er: prepared };
}

export type { ErRenderContext } from './context.ts';
export type { Band, EdgeView, EntityView, ErPrepared, GroupView, RowView } from './prepare.ts';
export { genericType, prepareEr } from './prepare.ts';
