/**
 * The mindmap layout (spec #294 T3): the builder's graph through `ctx.layout`, the engine the
 * `layout` config names (`tree` by default, `layered` or ELK when named, D282, D284). It calls
 * `ctx.layout` only, never a bundled fallback, so `tree` stays in its own lazy chunk.
 */
import type { LayoutModel } from '@mermaid-js/core/layout';
import type { MindmapModel } from '../model.ts';
import type { MindmapLayoutContext } from './context.ts';
import { prepareMindmap, type MindmapPrepared } from './prepare.ts';

/** The engine's model plus the measured views it was built from. */
export interface MindmapLayout extends LayoutModel {
  readonly mindmap: MindmapPrepared;
}

/** Measures `model` and lays it out with `ctx.layout`. */
export function layoutMindmap(model: MindmapModel, ctx: MindmapLayoutContext): MindmapLayout {
  const prepared = prepareMindmap(model, ctx);
  return { ...ctx.layout(prepared.graph), mindmap: prepared };
}
