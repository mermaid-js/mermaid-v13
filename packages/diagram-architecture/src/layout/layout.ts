/**
 * The architecture layout (spec #525 T3): the builder's graph through `ctx.layout`, the engine
 * the `layout` config names (`compass` by default, D284, D326, D560), with one warning for what
 * `layered` or `dagre` leaves out. It calls `ctx.layout` only, never a bundled engine, so
 * `compass` stays in its own lazy chunk.
 */
import type { LayoutModel } from '@mermaid-js/core/layout';
import type { ArchitectureModel } from '../model.ts';
import type { ArchitectureLayoutContext } from './context.ts';
import { warnPlacementIgnored } from './engine.ts';
import { prepareArchitecture, type ArchitecturePrepared } from './prepare.ts';

/** The engine's model plus the measured views it was built from. */
export interface ArchitectureLayout extends LayoutModel {
  readonly architecture: ArchitecturePrepared;
}

/** Measures `model` and lays it out with `ctx.layout`, saying what that engine leaves out. */
export function layoutArchitecture(
  model: ArchitectureModel,
  ctx: ArchitectureLayoutContext
): ArchitectureLayout {
  const prepared = prepareArchitecture(model, ctx);
  warnPlacementIgnored(prepared.graph, ctx);
  return { ...ctx.layout(prepared.graph), architecture: prepared };
}
