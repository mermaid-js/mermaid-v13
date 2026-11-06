/**
 * The timeline custom layout (spec #291 T3, `layoutKind: 'custom'`): `TimelineModel` in,
 * `TimelineLayout` out, without the graph engine. Every label is measured first, with the
 * injected measurer and core's label layout (D225), to v12's widths; then one function per
 * direction places the boxes (D250). Every length comes from the metrics table (pitfall 13).
 */
import type { TimelineModel } from '../model.ts';
import { envOf, type TimelineLayoutContext } from './env.ts';
import { layoutLR } from './lr.ts';
import { layoutTD } from './td.ts';
import type { TimelineLayout } from './types.ts';

/** Lays out a timeline in its direction. */
export function layoutTimeline(model: TimelineModel, ctx: TimelineLayoutContext): TimelineLayout {
  const env = envOf(ctx);
  return model.direction === 'TD' ? layoutTD(env, model) : layoutLR(env, model);
}
