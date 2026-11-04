// Lays out a state diagram: the builder's graph through `ctx.layout` (default core `layered`,
// D106), then the drawing pass #140 settled on: each region frame is stretched along its
// composite's flow to the composite's inner extent, and a divider runs down the middle of each
// gap between neighbouring regions (`research/state-regions.md`). No layout change: only the
// region frames move, and they hold nothing but their own members.
import type { LayoutModel, LayoutModelGroup } from '@mermaid-js/core/layout';
import { layered } from '@mermaid-js/core/layout';
import type { StateModel } from '../parser/index.ts';
import type { StateRenderContext } from './context.ts';
import { prepareState, type StatePrepared } from './prepare.ts';

/** A line between two neighbouring regions of a composite, across its inner extent. */
export interface StateDivider {
  composite: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The state layout: the engine's LayoutModel with stretched region frames, plus the views. */
export interface StateLayout extends LayoutModel {
  /** Between regions placed side by side (or stacked, D113), composite by composite. */
  readonly dividers: readonly StateDivider[];
  /** Set by `layoutState`; a `postLayout` hook that builds a new model drops it. */
  readonly state?: StatePrepared;
}

/** Measures the model and lays it out with `ctx.layout` (default `layered`). */
export function layoutState(model: StateModel, ctx: StateRenderContext): StateLayout {
  const prepared = prepareState(model, ctx);
  const laid = (ctx.layout ?? layered)(prepared.graph);
  const groups = new Map(laid.groups);
  const dividers = stretchRegions(prepared, groups);
  return { ...laid, groups, dividers, state: prepared };
}

interface Span {
  lo: number;
  hi: number;
}

// Floating-point noise, not a length.
const EPS = 1e-6;
const spanOf = (g: LayoutModelGroup, axis: 'x' | 'y'): Span =>
  axis === 'x'
    ? { lo: g.x - g.width / 2, hi: g.x + g.width / 2 }
    : { lo: g.y - g.height / 2, hi: g.y + g.height / 2 };

/** True when the regions' spans on `axis` are pairwise disjoint. */
function apart(boxes: readonly LayoutModelGroup[], axis: 'x' | 'y'): boolean {
  const spans = boxes.map((g) => spanOf(g, axis)).sort((a, b) => a.lo - b.lo);
  for (let i = 1; i < spans.length; i++) if (spans[i]!.lo < spans[i - 1]!.hi - EPS) return false;
  return true;
}

/**
 * Stretches each composite's region frames to its inner extent along the axis they share, and
 * returns the dividers. The regions sit apart across the composite's flow (or, when a
 * transition between two of them made the engine stack them, D113, along it); a composite
 * whose regions overlap both ways is left as laid out, with no dividers.
 */
function stretchRegions(
  prepared: StatePrepared,
  groups: Map<string, LayoutModelGroup>
): StateDivider[] {
  const dividers: StateDivider[] = [];
  const padding = new Map(prepared.graph.groups.map((g) => [g.id, g.padding]));
  for (const [comp, ids] of prepared.regions) {
    const outer = groups.get(comp);
    const boxes = ids.map((id) => groups.get(id));
    if (!outer || boxes.some((b) => !b)) continue;
    const pad = padding.get(comp)!;
    const inner = {
      x: { lo: outer.x - outer.width / 2 + pad.left, hi: outer.x + outer.width / 2 - pad.right },
      y: { lo: outer.y - outer.height / 2 + pad.top, hi: outer.y + outer.height / 2 - pad.bottom },
    };
    const regions = boxes as LayoutModelGroup[];
    const view = prepared.views.get(comp);
    const prefer: ('x' | 'y')[] =
      view && (view.flow === 'LR' || view.flow === 'RL') ? ['y', 'x'] : ['x', 'y'];
    // `across`: the axis the regions sit apart on; the frames stretch along the other.
    const across = regions.length === 1 ? undefined : prefer.find((a) => apart(regions, a));
    if (regions.length > 1 && !across) continue;
    const stretch: ('x' | 'y')[] = across ? [across === 'x' ? 'y' : 'x'] : ['x', 'y'];
    ids.forEach((id, i) => {
      const r = { ...regions[i]! };
      for (const axis of stretch) {
        const { lo, hi } = inner[axis];
        if (axis === 'x') {
          r.x = (lo + hi) / 2;
          r.width = hi - lo;
        } else {
          r.y = (lo + hi) / 2;
          r.height = hi - lo;
        }
      }
      groups.set(id, r);
    });
    if (!across) continue;
    const along = across === 'x' ? 'y' : 'x';
    const sorted = ids.map((id) => spanOf(groups.get(id)!, across)).sort((a, b) => a.lo - b.lo);
    for (let i = 1; i < sorted.length; i++) {
      const at = (sorted[i - 1]!.hi + sorted[i]!.lo) / 2;
      const { lo, hi } = inner[along];
      dividers.push(
        across === 'x'
          ? { composite: comp, x1: at, y1: lo, x2: at, y2: hi }
          : { composite: comp, x1: lo, y1: at, x2: hi, y2: at }
      );
    }
  }
  return dividers;
}
