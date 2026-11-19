/**
 * Where each relation runs among the others between the same two shapes (#680): the sideways
 * shift of its line, a self-loop's place among the loops on its shape, and whether its line is
 * spaced a tag from the next (#955 review).
 */
import { C4_METRICS as M } from './metrics.ts';
import { pairRoom, type LoopPlace } from './route.ts';
import type { Outline } from './shapes.ts';

/** Where a relation runs among the others between the same two shapes. */
export interface Place {
  /** How far it moves sideways, along its own normal. */
  readonly shift: number;
  /** A self-loop's place among the loops on its shape. */
  readonly loop?: LoopPlace;
  /** Its line is a tag's height from the next: its label stays on it, not pushed outward. */
  readonly spaced?: true;
}

/**
 * Where each relation runs among the others between the same two shapes (#680). A self-loop
 * gets its place among the loops on its shape. Any other relation moves sideways (along its own
 * normal), in either direction: none for the only one, else the group spread in steps of
 * `2 * pairShift` about the middle, the first statement's side first. A pair with one relation
 * each way keeps `pairShift` to either side of the middle, as before repeated relations were
 * kept. Where the lines run more across than up and down and carry tags (`tagStep`), the step
 * is at least a one-line tag's height and a `besideGap` either side, so that each tag can sit on
 * its own line (#955 review). Where the room the two shapes share (`pairRoom`) holds fewer
 * steps, the steps shrink to fit it: past `2 * room / near + 1` relations they are closer than
 * `near` and read as one band.
 */
export function pairPlaces(drawn: readonly { a: Outline; b: Outline }[], tagStep = 0): Place[] {
  interface Between {
    a: Outline;
    b: Outline;
    count: number;
    step?: number;
  }
  const groups = new Map<Outline, Map<Outline, Between>>();
  // Each relation's group and its place in it, counted as the group fills.
  const places = drawn.map(({ a, b }): [Between, number] => {
    let g = groups.get(a)?.get(b) ?? groups.get(b)?.get(a);
    if (!g) {
      g = { a, b, count: 0 };
      let ends = groups.get(a);
      if (!ends) groups.set(a, (ends = new Map<Outline, Between>()));
      ends.set(b, g);
    }
    return [g, g.count++];
  });
  return drawn.map(({ a }, k): Place => {
    const [g, nth] = places[k]!;
    if (g.a === g.b) return { shift: 0, loop: { nth, count: g.count } };
    if (g.count < 2) return { shift: 0 };
    g.step ??= Math.min(
      Math.max(2 * M.pairShift, across(g.a, g.b) ? tagStep : 0),
      (2 * pairRoom(g.a, g.b)) / (g.count - 1)
    );
    const side = ((g.count - 1) / 2 - nth) * g.step;
    const spaced = tagStep > 0 && across(g.a, g.b) && g.step >= tagStep;
    return { shift: a === g.a ? side : -side, ...(spaced ? { spaced: true as const } : {}) };
  });
}

/** Whether `outer` holds `inner` (a boundary and a shape in it). */
const contains = (outer: Outline, inner: Outline): boolean =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

/**
 * Whether lines between `a` and `b` run more across than up and down, so that tags on lines side
 * by side stack by their height: between shapes side by side, not one above the other or nested.
 */
function across(a: Outline, b: Outline): boolean {
  if (contains(a, b) || contains(b, a)) return false;
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  return Math.abs(dx) > Math.abs(dy);
}
