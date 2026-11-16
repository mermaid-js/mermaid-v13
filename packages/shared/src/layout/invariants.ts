/**
 * What the diagrams' layout invariant checks share (the `layout/invariants.ts` of each
 * `diagram-*` package, run by its DDLT-style tests): the walk for non-finite numbers and the
 * rectangle tests, each with the 1e-6 slack the copies had.
 */

/** A box by its top-left corner and size. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Slack of the layout invariants: rounding, not layout, may be off by this much. */
const EPS = 1e-6;

/** Every number in `value`, with its path (`layout.nodes[2].x`), depth first; `skip` is a key not entered. */
export function* numbers(value: unknown, path: string, skip?: string): Generator<[string, number]> {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`, skip);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value))
      if (k !== skip) yield* numbers(v, `${path}.${k}`, skip);
  }
}

/** Adds one `path is NaN` problem to `out` for every number in `value` that is not finite. */
export function nonFinite(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => nonFinite(v, `${path}[${i}]`, out));
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) nonFinite(v, `${path}.${k}`, out);
}

/** Whether `v` is in `lo`…`hi`, give or take `eps`. */
export const within = (v: number, lo: number, hi: number, eps = EPS): boolean =>
  v >= lo - eps && v <= hi + eps;

/** Whether `inner` lies in `outer`, give or take `eps`. */
export const rectInside = (inner: Rect, outer: Rect, eps = EPS): boolean =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.width <= outer.x + outer.width + eps &&
  inner.y + inner.height <= outer.y + outer.height + eps;

/** Whether two boxes overlap by more than `eps`. */
export const rectsOverlap = (a: Rect, b: Rect, eps = EPS): boolean =>
  a.x < b.x + b.width - eps &&
  b.x < a.x + a.width - eps &&
  a.y < b.y + b.height - eps &&
  b.y < a.y + a.height - eps;
