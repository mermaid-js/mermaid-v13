/**
 * Score faces (v12 `svgDraw.drawFace`): the place a score is drawn at, and the mouth as an
 * absolute path in place of v12's d3 `arc` (R-PERF-2).
 */
import { pathBuilder, type PathData } from '@mermaid-js/core/svg';
import type { Circle, FaceLayout, Mouth } from './types.ts';
import { drawnScore, SCORE, type JourneyMetrics } from './metrics.ts';

/** v12's rule on the score as written: `NaN` compares false both ways, so it is flat. */
export function mouthOf(score: number): Mouth {
  if (score > SCORE.mid) return 'smile';
  if (score < SCORE.mid) return 'sad';
  return 'flat';
}

/** The y of a face's centre for a score already drawn to the scale, `drop` below v12's (D615). */
export const faceY = (m: JourneyMetrics, drawn: number, drop = 0): number =>
  m.faceTop + drop + (SCORE.max - drawn) * m.faceStep;

/** The y of the lowest face place, where every task line ends. */
export const lineEnd = (m: JourneyMetrics): number => faceY(m, SCORE.min);

/**
 * v12's d3 arc band, half a ring between `mouthInner` and `mouthOuter`: the lower half for a
 * smile (d3 angles π/2 to 3π/2), the upper half for a frown (3π/2 to 5π/2), both swept the
 * same way from `from` to the other side.
 */
function arcBand(m: JourneyMetrics, cx: number, cy: number, from: 1 | -1): PathData {
  const o = m.mouthOuter;
  const i = m.mouthInner;
  return pathBuilder()
    .moveTo(cx + from * o, cy)
    .arcTo(o, o, 0, true, true, cx - from * o, cy)
    .lineTo(cx - from * i, cy)
    .arcTo(i, i, 0, true, false, cx + from * i, cy)
    .close()
    .done();
}

export function faceOf(m: JourneyMetrics, cx: number, score: number, drop = 0): FaceLayout {
  const cy = faceY(m, drawnScore(score), drop);
  const mouth = mouthOf(score);
  let mouthPath: PathData;
  if (mouth === 'smile') mouthPath = arcBand(m, cx, cy + m.smileDrop, 1);
  else if (mouth === 'sad') mouthPath = arcBand(m, cx, cy + m.sadDrop, -1);
  else
    mouthPath = pathBuilder()
      .moveTo(cx - m.flatHalf, cy + m.flatDrop)
      .lineTo(cx + m.flatHalf, cy + m.flatDrop)
      .done();
  const eye = (side: 1 | -1): Circle => ({
    cx: cx + side * m.eyeOffset,
    cy: cy - m.eyeOffset,
    r: m.eyeRadius,
  });
  return { cx, cy, r: m.faceRadius, mouth, mouthPath, eyes: [eye(-1), eye(1)] };
}
