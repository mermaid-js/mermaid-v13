/**
 * The actor glyphs (v12 `shapes/usecaseActor*.ts` at fa796a943), centred on (0, 0) in a 56×72
 * box: the stick figure, the hollow figure (a head circle and a body outline, unfilled), the
 * awesome silhouette; and the business marks, a chord across the head (or the icon frame).
 */
import type { PathBuilder, PathData } from '@mermaid-js/core/svg';
import type { UsecaseActorType } from '../model.ts';

/**
 * A glyph outline as v12 wrote it, in absolute commands: `M x y`, `L x y`, `C x1 y1 x2 y2 x y`,
 * `Z` (v12's `H` and `V` written as `L`). Built through the writer's path builder, so the `d`
 * attribute holds numbers only.
 */
export type Glyph = readonly (readonly [string, ...number[]])[];

export const STICK_FIGURE: Glyph = [
  ['M', 0, -12],
  ['C', 6.627, -12, 12, -17.373, 12, -24],
  ['C', 12, -30.627, 6.627, -36, 0, -36],
  ['C', -6.627, -36, -12, -30.627, -12, -24],
  ['C', -12, -17.373, -6.627, -12, 0, -12],
  ['Z'],
  ['M', 0, -12],
  ['L', 0, 8],
  ['M', -17, -5],
  ['L', 17, -5],
  ['M', 0, 8],
  ['L', -15, 28],
  ['M', 0, 8],
  ['L', 15, 28],
];

export const HOLLOW_BODY: Glyph = [
  ['M', -22, -10],
  ['L', 22, -10],
  ['L', 22, 0],
  ['L', 6, 0],
  ['L', 22, 17],
  ['L', 13, 28],
  ['L', 0, 13],
  ['L', -13, 28],
  ['L', -22, 17],
  ['L', -6, 0],
  ['L', -22, 0],
  ['Z'],
];

/** The hollow figure's head: centre y and radius. */
export const HOLLOW_HEAD = Object.freeze({ cy: -23, r: 9 });

export const AWESOME_SILHOUETTE: Glyph = [
  ['M', 0, -34],
  ['C', 7.18, -34, 13, -28.18, 13, -21],
  ['C', 13, -13.82, 7.18, -8, 0, -8],
  ['C', -7.18, -8, -13, -13.82, -13, -21],
  ['C', -13, -28.18, -7.18, -34, 0, -34],
  ['Z'],
  ['M', -24, 25],
  ['C', -24, 7, -14, -3, 0, -3],
  ['C', 14, -3, 24, 7, 24, 25],
  ['C', 24, 28, 21, 30, 18, 30],
  ['L', -18, 30],
  ['C', -21, 30, -24, 28, -24, 25],
  ['Z'],
];

/** `glyph` as path data. */
export function glyphPath(b: PathBuilder, glyph: Glyph): PathData {
  for (const [op, ...n] of glyph) {
    if (op === 'M') b.moveTo(n[0]!, n[1]!);
    else if (op === 'L') b.lineTo(n[0]!, n[1]!);
    else if (op === 'C') b.curveTo(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!);
    else b.close();
  }
  return b.done();
}

/** The chord's angle and how far off the centre it runs, as a share of the radius. */
const ANGLE = Math.PI / 3;
const OFFSET = 0.6;

/** A head's business chord: the end points of a chord `OFFSET · r` off its centre. */
function chord(cy: number, r: number): readonly [number, number, number, number] {
  const off = r * OFFSET;
  const half = r * Math.sqrt(1 - OFFSET ** 2);
  const dx = Math.cos(ANGLE);
  const dy = -Math.sin(ANGLE);
  const cx = off * -dy;
  const my = cy + off * dx;
  return [cx - half * dx, my - half * dy, cx + half * dx, my + half * dy];
}

/** The business mark of each actor kind, as a line's end points. */
export const BUSINESS_MARK: Readonly<Record<UsecaseActorType, readonly number[]>> = {
  normal: chord(-24, 12),
  hollow: chord(HOLLOW_HEAD.cy, HOLLOW_HEAD.r),
  awesome: chord(-21, 13),
  icon: [12, -8, 26, -26],
};

/** v12's glyph class per kind (`variantClass`). */
export const GLYPH_CLASS: Readonly<Record<UsecaseActorType, string>> = {
  normal: 'usecase-actor-shape usecase-actor-normal',
  hollow: 'usecase-actor-hollow',
  awesome: 'usecase-actor-awesome',
  icon: 'usecase-actor-icon',
};
