// How event modeling draws a frame relation under a curve key (D733, D760). The curve is, strongest
// first, `eventmodeling.curve`, then the top-level `curve`. Neither is a `CurveKind` default:
// with nothing set the relation is drawn as before, from the layout's own points and head, so
// there is no curve for `routePath` to take. A curve set draws the relation with the shared
// `routePath`, and its head takes its angle and its trim from the `EdgePath` that returns.
import type { RenderContext } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Point, RoutePoint } from '@mermaid-js/core/layout';
import type { SvgWriter } from '@mermaid-js/core/svg';
import {
  curveResolver,
  DEFAULT_CURVE,
  routePath,
  type CurveKind,
  type EdgePath,
} from '@mermaid-js/shared/svg/route';
import { EVENTMODELING_METRICS as M } from '../layout/metrics.ts';
import type { EventModelRelationLayout } from '../layout/index.ts';

/**
 * The curve every relation but a self relation is drawn with, or `undefined` for today's look:
 * neither `eventmodeling.curve` nor `curve` is set. Resolved once per render, through
 * `curveResolver`; an unknown name draws `rounded` and warns `CURVE_UNKNOWN` once.
 */
export function relationCurve(
  config: Pick<ResolvedConfig, 'curve' | 'eventmodeling'>,
  warn: RenderContext['warn']
): CurveKind | undefined {
  const own = config.eventmodeling?.curve;
  if (own === undefined && config.curve === undefined) return undefined;
  // Never the fallback: one of the keys is set, which is why this is a render's one resolve.
  return curveResolver(config.curve, DEFAULT_CURVE, warn)(own);
}

/** Whether a relation is drawn from its own points whatever the curve: the self loop (D760). */
export const keepsItsRoute = (r: EventModelRelationLayout): boolean => r.route === 'self';

/** The layout's points as route points: `axis` is the direction of the leg that ends there. */
function routeOf(r: EventModelRelationLayout): RoutePoint[] {
  return r.points.map((p: Point, i) => ({
    x: p.x,
    y: p.y,
    // `along` runs across; `down` and `up` run down or up, and so do the legs of `under`
    // but its middle one.
    axis: r.route === 'along' || (r.route === 'under' && i === 2) ? 'h' : 'v',
  }));
}

/**
 * The relation drawn with `kind`: the path, trimmed at the end by the head's length, and the
 * way it ends. The head's tip stays at the layout's last point.
 */
export function curvedRelation(
  w: SvgWriter,
  r: EventModelRelationLayout,
  kind: CurveKind
): EdgePath {
  return routePath(w, routeOf(r), kind, 0, M.headLength);
}
