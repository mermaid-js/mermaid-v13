/**
 * The usecase layout (spec #517 T3): `layoutUsecase` measures every node before layout, lays the
 * graph out with `ctx.layout` (default core's `layered`: v12's ELK default is not kept,
 * R-LAYOUT-7), then moves each edge end on an oval use case onto the oval. The engine is named
 * by `layout` config and picked by `mermaid` (`dagre` is `layered`, `elk` without the plugin
 * warns `ELK_NOT_INSTALLED` and draws `layered`, D173; `compass` takes its sides from
 * `direction`, D327). The renderer (T4) reads `UsecaseLayout.usecase`.
 */
import { layered, type LayoutGraph, type LayoutModel } from '@mermaid-js/core/layout';
import type { UsecaseModel } from '../model.ts';
import { clipToOvals } from './clip.ts';
import type { UsecaseLayoutContext } from './context.ts';
import { placeNotes } from './notes.ts';
import { isOval, prepareUsecase, type UsecasePrepared } from './prepare.ts';

export interface UsecaseLayout extends LayoutModel {
  /** Set by `layoutUsecase`; a `postLayout` hook that builds a new model drops it. */
  readonly usecase?: UsecasePrepared;
}

/**
 * Measures the model, lays it out with `ctx.layout` (default `layered`), puts each note beside
 * its target (`notes.ts`: a second layout when one lands away), clips ends to ovals. With the cell
 * profile (`ctx.units`, text output) the graph is on the grid and nothing is clipped.
 */
export function layoutUsecase(model: UsecaseModel, ctx: UsecaseLayoutContext): UsecaseLayout {
  const engine = (g: LayoutGraph): LayoutModel => (ctx.layout ? ctx.layout(g) : layered(g));
  const { prepared, laid } = placeNotes(prepareUsecase(model, ctx), engine);
  // On the grid (text output) ends stay in their cells: use cases are drawn `( label )`.
  if (prepared.graph.grid !== undefined) return { ...laid, usecase: prepared };
  const ends = new Map(prepared.edges.map((e) => [e.id, e]));
  const oval = (id: string): boolean => isOval(prepared.nodes.get(id));
  return { ...clipToOvals(laid, ends, oval), usecase: prepared };
}

export type { UsecaseLayoutContext } from './context.ts';
