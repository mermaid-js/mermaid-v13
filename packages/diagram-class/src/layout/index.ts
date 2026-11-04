/**
 * Class layout (spec #126 T3): `layoutClass` measures every class box, note and interface
 * before layout and lays the graph out with `ctx.layout` (default core's `layered`, D106).
 * The renderer (#156) reads `ClassLayout.class`: boxes with their rows and dividers, notes,
 * interfaces, namespace groups and edges with their kinds and markers.
 */
import { layered, type LayoutModel } from '@mermaid-js/core/layout';
import type { ClassModel } from '../parser/model.ts';
import type { ClassLayoutContext } from './context.ts';
import { prepare, type ClassPrepared } from './prepare.ts';

export interface ClassLayout extends LayoutModel {
  /** Set by `layoutClass`; a `postLayout` hook that builds a new model drops it. */
  readonly class?: ClassPrepared;
}

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutClass(model: ClassModel, ctx: ClassLayoutContext): ClassLayout {
  const prepared = prepare(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  return { ...laid, class: prepared };
}

export type { ClassLayoutContext } from './context.ts';
export type { ClassBoxGeometry, ClassCompartment, ClassRow } from './box.ts';
export { prepare as prepareClass } from './prepare.ts';
export type {
  ClassBoxView,
  ClassCurve,
  ClassEdgeKind,
  ClassEdgeView,
  ClassNodeView,
  ClassPrepared,
  InterfaceView,
  NamespaceView,
  NoteView,
} from './prepare.ts';
