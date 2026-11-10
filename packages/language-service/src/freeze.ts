/**
 * Snapshots are immutable (D90): everything a query hands out is frozen, so a caller that
 * edits a result cannot change what the next call returns.
 */

/** Freeze `value` and the plain objects and arrays inside it, in place; returns it. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  // No key array per object: results hold tens of thousands of small ones (R-LANG-4).
  // Plain objects and class instances only, whose methods are not enumerable.
  if (Array.isArray(value)) for (const v of value as unknown[]) deepFreeze(v);
  else for (const k in value) deepFreeze((value as Record<string, unknown>)[k]);
  return value;
}
