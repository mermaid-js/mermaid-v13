/**
 * Orders two strings by UTF-16 code unit (R-ARCH-6, DESIGN §12.4): the same result in every
 * locale and on every host, which `localeCompare` is not (#676). Every id and name tie-break in
 * the swimlane engine uses it.
 */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
