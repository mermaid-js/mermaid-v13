/**
 * The c4-beta layout (spec #730 §Layout): a `C4BetaModel` measured (`./prepare.ts`), laid out by
 * core's `layered` engine, and converted into the `C4Layout` scene legacy C4's painters draw
 * (`./scene.ts`). c4-beta stays in the one `c4` plugin and calls the engine directly, as the
 * usecase package's fallback does: a custom plugin's `ctx.layout` throws. Reachable from specs
 * only until the detector and the renderer land.
 */
import { layered, type LayoutModel } from '@mermaid-js/core/layout';
import type { C4Layout } from '../layout/types.ts';
import {
  prepareC4Beta,
  type C4BetaLayoutContext,
  type C4BetaLayoutOptions,
  type C4BetaPrepared,
} from './prepare.ts';
import { placeC4Beta } from './scene.ts';

/** Everything a c4-beta layout produces: the engine's input and answer, and the scene. */
export interface C4BetaLaidOut {
  readonly prepared: C4BetaPrepared;
  readonly laid: LayoutModel;
  readonly scene: C4Layout;
}

/** Lays `model` out. Pure: the model is not changed, and equal input gives equal output. */
export function layoutC4BetaFull(
  model: C4BetaPrepared['model'],
  ctx: C4BetaLayoutContext,
  options?: C4BetaLayoutOptions
): C4BetaLaidOut {
  const prepared = prepareC4Beta(model, ctx, options);
  const laid = layered(prepared.graph);
  return { prepared, laid, scene: placeC4Beta(prepared, laid) };
}

/** The scene of `model`. */
export const layoutC4Beta = (...args: Parameters<typeof layoutC4BetaFull>): C4Layout =>
  layoutC4BetaFull(...args).scene;

export type { C4BetaLayoutContext, C4BetaLayoutOptions } from './prepare.ts';
