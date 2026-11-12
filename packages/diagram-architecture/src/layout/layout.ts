/**
 * The architecture layout (spec #525 T3): the builder's graph through `ctx.layout`, the engine
 * the `layout` config names (`compass` by default, D284, D326). It calls `ctx.layout` only,
 * never a bundled engine, so `compass` stays in its own lazy chunk.
 */
import type { LayoutModel } from '@mermaid-js/core/layout';
import type { ArchitectureModel } from '../model.ts';
import type { ArchitectureLayoutContext } from './context.ts';
import { prepareArchitecture, type ArchitecturePrepared } from './prepare.ts';

/** The engine's model plus the measured views it was built from. */
export interface ArchitectureLayout extends LayoutModel {
  readonly architecture: ArchitecturePrepared;
}

/** Measures `model` and lays it out with `ctx.layout`. */
export function layoutArchitecture(
  model: ArchitectureModel,
  ctx: ArchitectureLayoutContext
): ArchitectureLayout {
  const prepared = prepareArchitecture(model, ctx);
  return { ...ctx.layout(prepared.graph), architecture: prepared };
}
