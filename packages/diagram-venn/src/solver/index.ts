// cspell:ignore Gratzl
/**
 * The venn solver (spec #429 T3, D411, D413): areas in, circles and label points out, in the
 * steps venn.js's `VennDiagram` takes for mermaid's drawn chart: solve, normalise (orientation
 * π/2, clusters packed), scale into the box with the padding, then the text centres.
 *
 * Ported from venn.js 2.0.0 (https://github.com/upsetjs/venn.js, `src/diagram.js`,
 * `VennDiagram`), MIT License, Copyright (c) 2013 Ben Frederickson,
 * Copyright (c) 2021 Samuel Gratzl. Dropping the zero-size sets, which `VennDiagram` does first,
 * is the layout's step.
 */
import type { Circle } from './circles.ts';
import { normalizeSolution, ORIENTATION, scaleSolution, type SetCircle } from './normalize.ts';
import { seededRandom } from './random.ts';
import { computeTextCentres, type TextCentre } from './regions.ts';
import { record, venn, type Area } from './solve.ts';

export { areaKey, intersectionAreaPath } from './regions.ts';
export type { RegionArc, RegionPath, TextCentre } from './regions.ts';
export { intersectionArea, intersectionStats } from './circles.ts';
export type { Circle, Point } from './circles.ts';
export { lossFunction, addMissingAreas } from './solve.ts';
export type { Area, Solution } from './solve.ts';
export type { SetCircle } from './normalize.ts';
export { seededRandom, VENN_SEED } from './random.ts';

/** The box a solution is scaled into. */
export interface SolveBox {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

export interface Solved {
  /** One circle per set id, in venn.js's order. */
  readonly circles: Readonly<Record<string, SetCircle>>;
  /** The label point of each area, by `areaKey(sets)`. */
  readonly centres: ReadonlyMap<string, TextCentre>;
}

/**
 * Lays out `areas` in `box`. Every set an overlap names must be one of `areas` with a size
 * above 0; no areas give no circles.
 */
export function solveVenn(
  areas: readonly Area[],
  box: SolveBox,
  random: () => number = seededRandom()
): Solved {
  if (areas.length === 0) return { circles: record<SetCircle>(), centres: new Map() };
  const solution = normalizeSolution(venn(areas, { random }), ORIENTATION);
  const circles = scaleSolution(
    solution as Record<string, Circle>,
    box.width,
    box.height,
    box.padding
  );
  return { circles, centres: computeTextCentres(circles, areas) };
}
