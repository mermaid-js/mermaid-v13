/**
 * A relation's path as plain commands, for the renderer's `PathBuilder` (the reference
 * implementation's `route.ts` `path()` and its self-loop, at commit 3a2f075): a line; upright and
 * level stretches with corners rounded to at most `corner`; or a self-loop's cubic. `startTrim` and
 * `endTrim` stop the line short of its ends, under the arrowheads the renderer draws there.
 */
import { C4_METRICS as M } from './metrics.ts';
import type { C4RelationLayout } from './types.ts';

export type C4PathCommand =
  | { readonly op: 'M' | 'L'; readonly x: number; readonly y: number }
  | {
      readonly op: 'Q';
      readonly x1: number;
      readonly y1: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly op: 'C';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    };

export function c4RelationPath(
  rel: Pick<C4RelationLayout, 'route' | 'points' | 'controls' | 'start' | 'end'>,
  startTrim = 0,
  endTrim = 0
): C4PathCommand[] {
  const p = rel.points;
  const first = p[0]!;
  const last = p[p.length - 1]!;
  // Each trim runs back along the way its arrowhead points.
  const from = { x: first.x - rel.start.dx * startTrim, y: first.y - rel.start.dy * startTrim };
  const to = { x: last.x - rel.end.dx * endTrim, y: last.y - rel.end.dy * endTrim };
  if (rel.route === 'loop' && rel.controls) {
    const [c1, c2] = rel.controls;
    return [
      { op: 'M', ...from },
      { op: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, ...to },
    ];
  }
  const out: C4PathCommand[] = [{ op: 'M', ...from }];
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1]!;
    const at = p[i]!;
    const next = p[i + 1]!;
    const ix = Math.sign(at.x - prev.x);
    const iy = Math.sign(at.y - prev.y);
    const ox = Math.sign(next.x - at.x);
    const oy = Math.sign(next.y - at.y);
    const r = Math.min(
      M.corner,
      Math.abs(at.x - prev.x + at.y - prev.y) / 2,
      Math.abs(next.x - at.x + next.y - at.y) / 2
    );
    out.push({ op: 'L', x: at.x - ix * r, y: at.y - iy * r });
    out.push({ op: 'Q', x1: at.x, y1: at.y, x: at.x + ox * r, y: at.y + oy * r });
  }
  out.push({ op: 'L', ...to });
  return out;
}
