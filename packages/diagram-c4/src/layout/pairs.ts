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
  /**
   * One of several tagged lines across between two shapes (D679): its tag belongs on its line,
   * and one that leaves it is crowded.
   */
  readonly tagged?: true;
  /** Its line is a tag's height from the next: its label stays on it, not pushed outward. */
  readonly spaced?: true;
  /**
   * Its line is closer than a tag to the next, but at least half a tag (D679): its tag stays on
   * it at this end of the line, the next line's at the other, so the two stand side by side.
   */
  readonly stagger?: Stagger;
}

/** The end of its line a staggered tag keeps to: where the line starts or ends. */
export type Stagger = 'start' | 'end';

/**
 * How the tags of `count` lines spread over `room` either side of the middle (`pairRoom`)
 * stand, `tagStep` the step a one-line tag needs (D679): each on its line in one column, a tag
 * apart; staggered, the lines half a tag apart and the tags alternately at one end and the
 * other; or squeezed, the lines closer still, the tags wherever they find room.
 */
export type Stack = 'column' | 'stagger' | 'squeezed';

export function stackOf(count: number, room: number, tagStep: number): Stack {
  const span = Math.max(0, count - 1) * tagStep;
  if (span <= 2 * room) return 'column';
  return span / 2 <= 2 * room ? 'stagger' : 'squeezed';
}

/** The relations between two shapes, and the step between their lines once known. */
interface Between {
  readonly a: Outline;
  readonly b: Outline;
  count: number;
  /** The step the tallest tag among them needs (0 without tags). */
  tagStep: number;
  step?: number;
}

/**
 * Where each relation runs among the others between the same two shapes (#680). A self-loop
 * gets its place among the loops on its shape. Any other relation moves sideways (along its own
 * normal), in either direction: none for the only one, else the group spread in steps of
 * `2 * pairShift` about the middle, the first statement's side first. A pair with one relation
 * each way keeps `pairShift` to either side of the middle, as before repeated relations were
 * kept. Where the lines run more across than up and down and carry tags (each relation's
 * `tagStep`: its tag's height, at least a one-line tag's, and a `besideGap` either side), the
 * step is at least the largest of the group's, so that each tag can sit on
 * its own line (#955 review). Where the room the two shapes share (`pairRoom`) holds fewer
 * steps, the steps shrink to fit it: down to half a tag the tags are staggered along their lines
 * (D679, {@link stackOf}); past `2 * room / near + 1` relations the lines are closer than `near`
 * and read as one band.
 */
export function pairPlaces(
  drawn: readonly { a: Outline; b: Outline; tagStep?: number }[]
): Place[] {
  const groups = new Map<Outline, Map<Outline, Between>>();
  // Each relation's group and its place in it, counted as the group fills.
  const places = drawn.map(({ a, b, tagStep = 0 }): [Between, number] => {
    let g = groups.get(a)?.get(b) ?? groups.get(b)?.get(a);
    if (!g) {
      g = { a, b, count: 0, tagStep: 0 };
      let ends = groups.get(a);
      if (!ends) groups.set(a, (ends = new Map<Outline, Between>()));
      ends.set(b, g);
    }
    g.tagStep = Math.max(g.tagStep, tagStep);
    return [g, g.count++];
  });
  return drawn.map(({ a }, k): Place => {
    const [g, nth] = places[k]!;
    if (g.a === g.b) return { shift: 0, loop: { nth, count: g.count } };
    if (g.count < 2) return { shift: 0 };
    return placeIn(g, nth, a);
  });
}

/**
 * The `nth` line between two shapes, drawn from `a`: shifted to its step, and, where the lines
 * carry tags, spaced a tag apart or staggered (D679). An even line's tag keeps to the group's
 * first shape, an odd one's to the other, so neighbouring tags stand at opposite ends.
 */
function placeIn(g: Between, nth: number, a: Outline): Place {
  const tagged = g.tagStep > 0 && across(g.a, g.b);
  g.step ??= Math.min(
    Math.max(2 * M.pairShift, tagged ? g.tagStep : 0),
    (2 * pairRoom(g.a, g.b)) / (g.count - 1)
  );
  const side = ((g.count - 1) / 2 - nth) * g.step;
  const shift = a === g.a ? side : -side;
  return tagged ? { shift, ...tagPlace(g, nth, a) } : { shift };
}

/** How a tagged line's tag stands: on its line a tag apart, staggered, or squeezed (D679). */
function tagPlace(g: Between, nth: number, a: Outline): Omit<Place, 'shift'> {
  const step = g.step!;
  if (step < g.tagStep / 2) return { tagged: true };
  if (step >= g.tagStep) return { tagged: true, spaced: true };
  const atFirst = nth % 2 === 0;
  return { tagged: true, spaced: true, stagger: atFirst === (a === g.a) ? 'start' : 'end' };
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
