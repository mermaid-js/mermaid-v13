/**
 * Snapshots are immutable (D90): everything a query hands out is frozen, so a caller that
 * edits a result cannot change what the next call returns.
 */

/** Freeze `value` and the plain objects and arrays inside it, in place; returns it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
  return value;
}
