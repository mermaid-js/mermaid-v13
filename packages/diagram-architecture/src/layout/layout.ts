/**
 * The architecture layout (spec #525 T3): the builder's graph through `ctx.layout`, the engine
 * the `layout` config names (`compass` by default, D284, D326, D560), with one warning for what
 * `layered` or `dagre` leaves out. It calls `ctx.layout` only, never a bundled engine, so
 * `compass` stays in its own lazy chunk.
 *
 * The renderer wraps the label of a level edge (`R`–`L` or `L`–`R`) that runs straight to the
 * line's length, as v12 did (D507, #774), so the engine is not given that label's size and the
 * gap between the two ends stays the default. Which level edges run straight is known only once
 * laid out: the graph is laid out without their labels, and when one did not run straight it
 * gets its label back and the graph is laid out again, for the engine to make room for it. The
 * flow engines never draw a level edge straight (they put `b` under `a` for `a:R -- L:b`), so
 * they get every label and lay the graph out once.
 */
import type { LayoutEdge, LayoutGraph, LayoutModel } from '@mermaid-js/core/layout';
import type { ArchitectureModel } from '../model.ts';
import type { ArchitectureLayoutContext } from './context.ts';
import { flowEngine, warnPlacementIgnored } from './engine.ts';
import { prepareArchitecture, type ArchitecturePrepared } from './prepare.ts';

/** The engine's model plus the measured views it was built from. */
export interface ArchitectureLayout extends LayoutModel {
  /** The views, with the graph the engine laid out (level labels left out where straight). */
  readonly architecture: ArchitecturePrepared;
}

/** An edge between a right and a left side, with a label. */
const level = (e: LayoutEdge): boolean =>
  e.label !== undefined &&
  ((e.sides?.source === 'right' && e.sides.target === 'left') ||
    (e.sides?.source === 'left' && e.sides.target === 'right'));

function withoutLabel(e: LayoutEdge): LayoutEdge {
  const { label: _, ...rest } = e;
  return rest;
}

/** The graph the engine lays out, as above, and its layout. */
function laidOut(
  graph: LayoutGraph,
  ctx: ArchitectureLayoutContext
): { graph: LayoutGraph; layout: LayoutModel } {
  if (flowEngine(ctx) || !graph.edges.some(level)) return { graph, layout: ctx.layout(graph) };
  const bare: LayoutGraph = {
    ...graph,
    edges: graph.edges.map((e) => (level(e) ? withoutLabel(e) : e)),
  };
  const trial = ctx.layout(bare);
  const straight = (e: LayoutEdge): boolean => {
    const pts = trial.edges.get(e.id)?.points;
    return pts?.length === 2 && Math.abs(pts[0]!.y - pts[1]!.y) < 0.5;
  };
  if (graph.edges.every((e) => !level(e) || straight(e))) return { graph: bare, layout: trial };
  const some: LayoutGraph = {
    ...graph,
    edges: graph.edges.map((e) => (level(e) && straight(e) ? withoutLabel(e) : e)),
  };
  return { graph: some, layout: ctx.layout(some) };
}

/** Measures `model` and lays it out with `ctx.layout`, saying what that engine leaves out. */
export function layoutArchitecture(
  model: ArchitectureModel,
  ctx: ArchitectureLayoutContext
): ArchitectureLayout {
  const prepared = prepareArchitecture(model, ctx);
  warnPlacementIgnored(prepared.graph, ctx);
  const { graph, layout } = laidOut(prepared.graph, ctx);
  return { ...layout, architecture: { ...prepared, graph } };
}
